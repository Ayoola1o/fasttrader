import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { defaults, decision, replay, downsampleCurve, botLedger, contiguousBars, aggregateBars, computeATR, strategy, evaluateRuleSet, shouldWakeAutonomousAI } from './engine.mjs';
import { signalProvider, assessSignal } from './signal-ai.mjs';
import { createTelegram } from './telegram.mjs';
import { handleBridge } from './api/bridge.js';

test('replay decides at the close and fills at the next open with costs and sizing limits', () => {
  const rules = { ...defaults, period: 2, entry: 0, stop: 2, take: 4 };
  const bars = [
    { t: '2026-10-01T12:00:00Z', o: 100, c: 100 },
    { t: '2026-10-01T12:01:00Z', o: 100, c: 110 },
    { t: '2026-10-01T12:02:00Z', o: 125, c: 115 },
    { t: '2026-10-01T12:03:00Z', o: 112, c: 115 }
  ];
  const result = replay(rules, bars, { capital: 10000, fees: 20, slippage: 10 });
  assert.equal(result.trades.length, 2);
  assert.equal(result.trades[0].t, bars[2].t);
  assert.equal(result.trades[0].qty, 7);
  assert.ok(Math.abs(result.trades[0].price - 125.125) < 0.00001);
  assert.equal(result.trades[1].t, bars[3].t);
  assert.ok(result.trades[1].pnl < 0);
  assert.ok(result.drawdown < 0);
  assert.equal(decision(rules, [100,110], { equity: 9500, dayStart: 10000, cash: 9500, exposure: 0 }, null, 110), null);
});

test('bot budget tracks fills and reduces buying capacity after a realized loss', () => {
  const fill = (side, filled, price, time) => ({ symbol:'SPY', side, filled, price, t:'2026-10-01T12:0'+time+':00Z' });
  const buy = fill('buy', 4, 100, 0);
  const sell = fill('sell', 2, 70, 1);
  const book = botLedger([sell, buy], 'SPY', 500);
  assert.deepEqual({ qty:book.qty, invested:book.invested, realized:book.realized, available:book.available },
    { qty:2, invested:200, realized:-60, available:240 });
  assert.equal(botLedger([buy, fill('sell', 4, 110, 1)], 'SPY', 500).available, 500);
  assert.equal(botLedger([{ ...buy, price:null }], 'SPY', 500).available, 0);
  assert.equal(botLedger([], 'SPY', undefined).available, 0);
  assert.equal(book.boughtQty, 4);
});

test('replay honors intrabar stops, budget caps, and default Gemini model', () => {
  const rules = { ...defaults, period: 2, entry: 0, stop: 2, take: 5 };
  const bars = [
    { t: '2026-10-01T12:00:00Z', o: 100, h: 101, l: 99, c: 100 },
    { t: '2026-10-01T12:01:00Z', o: 100, h: 111, l: 100, c: 110 },
    { t: '2026-10-01T12:02:00Z', o: 110, h: 112, l: 107, c: 111 }
  ];
  const result = replay(rules, bars, { capital: 10000, budget: 350, fees: 0, slippage: 0 });
  assert.equal(result.trades.length, 2);
  assert.equal(result.trades[0].qty, 3);
  assert.equal(result.trades[1].side, 'sell');
  assert.ok(result.trades[1].price <= 110 * 0.98 + 1e-9);
  assert.equal(result.trades[1].reason, 'Stop loss');
  assert.equal(result.metrics.closedTrades, 1);
  assert.equal(result.metrics.losses, 1);
  assert.equal(result.metrics.winRate, 0);
  assert.equal(signalProvider({ GEMINI_API_KEY: 'test-key' }).model, 'gemini-3.5-flash');
});

test('replay avoids same-bar trailing-stop look-ahead bias, computes quant metrics, and downsamples curves', () => {
  const rules = { ...defaults, period: 2, entry: 0, stop: 10, take: 30, trailingStop: 5 };
  const bars = [
    { t: '2026-10-01T12:00:00Z', o: 100, h: 101, l: 99, c: 100, v: 500 },
    { t: '2026-10-01T12:01:00Z', o: 100, h: 111, l: 100, c: 110, v: 500 },
    // Entry fills at 110. Bar dips to 106 (-3.6%, above 5% trail from 110) then rallies to 120.
    // With look-ahead bias, highWater=120 would put trail at 114 and falsely stop out at 106!
    { t: '2026-10-01T12:02:00Z', o: 110, h: 120, l: 106, c: 118, v: 500 },
    // Next bar: highWater is now 120 (trail = 114), bar drops to 113 -> legitimate trailing stop!
    { t: '2026-10-01T12:03:00Z', o: 118, h: 119, l: 113, c: 114, v: 500 }
  ];
  const result = replay(rules, bars, { capital: 10000, fees: 10, slippage: 0 });
  assert.equal(result.trades.length, 2);
  assert.equal(result.trades[0].t, bars[2].t);
  assert.equal(result.trades[1].t, bars[3].t);
  assert.equal(result.trades[1].reason, 'Trailing stop');
  assert.equal(result.metrics.wins, 1);
  assert.equal(result.metrics.winRate, 100);
  assert.ok(result.metrics.totalFees > 0);
  assert.ok(Math.abs(result.metrics.buyAndHold - 14) < 0.001);
  // Downsample preserves endpoints and worst drawdown point
  const big = Array.from({ length: 2000 }, (_, i) => ({ t: String(i), value: 100, drawdown: i === 777 ? -25 : -1 }));
  const sampled = downsampleCurve(big, 200);
  assert.ok(sampled.length <= 203);
  assert.equal(sampled[0].t, '0');
  assert.equal(sampled.at(-1).t, '1999');
  assert.ok(sampled.some(p => p.t === '777' && p.drawdown === -25));
});

test('contiguous candle warmup blocks gapped entries while allowing protective exits and stop-loss cooldown', () => {
  const gapped = [
    { t: '2026-10-01T12:00:00Z', o: 100, c: 100, v: 500 },
    { t: '2026-10-01T12:20:00Z', o: 100, c: 115, v: 500 }
  ];
  assert.equal(contiguousBars(gapped, 2).length, 1);
  const rules = { ...defaults, period: 2, entry: 0, stop: 2, take: 5, cooldown: 2 };
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  // Entry blocked when not warmed up or on zero-volume bar or during cooldown
  assert.equal(decision(rules, [115], account, null, 115, null, { warmedUp: false }), null);
  assert.equal(decision(rules, [100, 115], account, null, 115, null, { warmedUp: true, volume: 0 }), null);
  assert.equal(decision(rules, [100, 115], account, null, 115, null, { warmedUp: true, cooldown: 1 }), null);
  // Protective stop-loss exit still fires even when not warmed up
  const exit = decision(rules, [95], account, { qty: 10, entry: 100 }, 95, null, { warmedUp: false });
  assert.equal(exit?.side, 'sell');
  assert.equal(exit?.stopLoss, true);
  // Replay enforces cooldown after stop-loss before re-entering
  const bars = [
    { t: '2026-10-01T12:00:00Z', o: 100, h: 101, l: 99, c: 100, v: 500 },
    { t: '2026-10-01T12:01:00Z', o: 100, h: 111, l: 100, c: 110, v: 500 },
    { t: '2026-10-01T12:02:00Z', o: 110, h: 112, l: 107, c: 111, v: 500 },
    { t: '2026-10-01T12:03:00Z', o: 111, h: 115, l: 111, c: 115, v: 500 },
    { t: '2026-10-01T12:04:00Z', o: 115, h: 118, l: 115, c: 118, v: 500 },
    { t: '2026-10-01T12:05:00Z', o: 118, h: 120, l: 118, c: 120, v: 500 }
  ];
  const replayed = replay(rules, bars, { capital: 10000, fees: 0, slippage: 0 });
  const buys = replayed.trades.filter(t => t.side === 'buy');
  assert.equal(buys.length, 2);
  assert.equal(buys[1].t, bars[5].t);
});

test('timeframe aggregation, mean reversion, breakout, and ATR stops work deterministically', () => {
  const mins = Array.from({ length: 10 }, (_, i) => ({
    t: new Date(Date.parse('2026-10-01T12:00:00Z') + i * 60000).toISOString(),
    o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 100
  }));
  const fiveMin = aggregateBars(mins, '5Min');
  assert.equal(fiveMin.length, 2);
  assert.equal(fiveMin[0].o, 100);
  assert.equal(fiveMin[0].c, 105);
  assert.equal(fiveMin[0].v, 500);
  assert.ok(computeATR(mins, 5) > 0);
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  const mr = { ...defaults, mode: 'mean_reversion', period: 5, entry: 1.0 };
  const mrBuy = decision(mr, [100, 100, 100, 100, 92], account, null, 92);
  assert.equal(mrBuy?.side, 'buy');
  const bo = { ...defaults, mode: 'breakout', period: 4, entry: 0 };
  const boBuy = decision(bo, [100, 101, 102, 105], account, null, 105);
  assert.equal(boBuy?.side, 'buy');
  const atrRule = { ...defaults, stop: 10, atrStop: 1 };
  const atrExit = decision(atrRule, [100, 98], account, { qty: 10, entry: 100 }, 98.5, null, { atr: 1 });
  assert.equal(atrExit?.side, 'sell');
  assert.equal(atrExit?.stopLoss, true);
});

test('custom rule builder supports indicator comparisons, crosses, trailing stop, maxHoldBars, and USD sizing', () => {
  const custom = strategy({
    ...defaults, name: 'Custom EMA Cross', mode: 'custom', sizeMode: 'usd', sizeUsd: 450,
    trailingStop: 2, maxHoldBars: 3, aiPrompt: 'Skip if news is bearish',
    rules: {
      entryLogic: 'all', exitLogic: 'any',
      entry: [
        { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'sma', period: 3 } },
        { left: { indicator: 'rsi', period: 3 }, op: 'gt', right: { indicator: 'number', value: 50 } }
      ],
      exit: [{ left: { indicator: 'close' }, op: 'lt', right: { indicator: 'sma', period: 3 } }]
    }
  });
  const bars = [
    { t: '2026-10-01T12:00:00Z', o: 100, h: 100, l: 99, c: 100, v: 500 },
    { t: '2026-10-01T12:01:00Z', o: 100, h: 101, l: 99, c: 100, v: 500 },
    { t: '2026-10-01T12:02:00Z', o: 100, h: 102, l: 100, c: 101, v: 500 },
    { t: '2026-10-01T12:03:00Z', o: 101, h: 106, l: 101, c: 105, v: 500 },
    { t: '2026-10-01T12:04:00Z', o: 105, h: 108, l: 105, c: 107, v: 500 },
    { t: '2026-10-01T12:05:00Z', o: 107, h: 112, l: 107, c: 112, v: 500 }
  ];
  const check = evaluateRuleSet(bars, custom.rules, 'entry');
  assert.equal(check.ready, true);
  assert.equal(check.pass, true);
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  const buy = decision(custom, bars.map(b => b.c), account, null, 112, null, { bars, warmedUp: true });
  assert.equal(buy?.side, 'buy');
  assert.equal(buy?.qty, 4); // floor(450 / 112) = 4
  // Trailing stop triggers when price drops >2% from highWater 120
  const trail = decision(custom, bars.map(b => b.c), account, { qty: 4, entry: 112 }, 117, null, { bars, warmedUp: true, highWater: 120 });
  assert.equal(trail?.side, 'sell');
  assert.match(trail?.rationale, /Trailing stop/);
  // Max hold bars triggers when holdBars >= 3
  const maxHold = decision(custom, bars.map(b => b.c), account, { qty: 4, entry: 112 }, 113, null, { bars, warmedUp: true, highWater: 113, holdBars: 3 });
  assert.equal(maxHold?.side, 'sell');
  assert.match(maxHold?.rationale, /Max hold/);
});

test('telegram notifier formats HTML safely, throttles connection spam, and sends test messages', async () => {
  const sent = [];
  const mockFetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const tg = createTelegram({ TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '999' }, mockFetch);
  assert.equal(tg.configured, true);
  assert.equal(await tg.notify('fills', 'BUY filled · BTC/USD', ['Filled: 0.01 @ <$60000>']), true);
  assert.match(sent[0].body.text, /&lt;\$60000&gt;/);
  assert.equal(await tg.notify('connections', 'Feed dropped'), true);
  assert.equal(await tg.notify('connections', 'Feed dropped'), false); // throttled
  const res = await tg.sendTest('alpaca');
  assert.equal(res.sent, true);
  assert.equal(sent.length, 3);
});

test('AI Notepad strategy validates notes, enforces hard stop-loss, and sends user notes to AI', async () => {
  assert.throws(() => strategy({ ...defaults, name: 'Empty Note', mode: 'ai_notepad', aiNotes: 'short' }), /AI Notepad/);
  const noteStrat = strategy({ ...defaults, name: 'Dip Note', mode: 'ai_notepad', timeframe: '15Min', aiNotes: 'Buy on oversold RSI dip above EMA 50, sell when RSI > 72.' });
  assert.equal(noteStrat.ai, true);
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  const bars = Array.from({ length: 15 }, (_, i) => ({ t: new Date(Date.now() - (15 - i) * 60000).toISOString(), o: 100, h: 101, l: 99, c: 100, v: 100 }));
  const prop = decision(noteStrat, bars.map(b => b.c), account, null, 100, null, { bars, warmedUp: true });
  assert.equal(prop?.aiAutonomous, true);
  // Hard stop-loss still triggers deterministically without AI
  const stop = decision(noteStrat, bars.map(b => b.c), account, { qty: 10, entry: 100 }, 97, null, { bars, warmedUp: true });
  assert.equal(stop?.protective, true);
  assert.equal(stop?.side, 'sell');
  // assessSignal includes user's notepad instructions in systemInstruction
  let captured;
  await assessSignal({ name: 'Gemini', key: 'k', model: 'gemini-2.5-flash' }, 'BTC/USD', 'buy', bars, async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ side: 'hold', rationale: 'Waiting for dip.' }) }] } }] }) };
  }, { aiAutonomous: true, aiNotes: noteStrat.aiNotes, indicators: { rsi14: 55 } });
  assert.match(captured.systemInstruction.parts[0].text, /Buy on oversold RSI dip/);
});

test('Autonomous AI strategy supports smart wake-up, hard stop-loss, fee-aware prompting, and dynamic allocation', async () => {
  const auto = strategy({
    ...defaults, name: 'BTC Free-Roam', symbol: 'BTC/USD', mode: 'ai_autonomous', timeframe: '15Min',
    aiWakeMode: 'smart', aiRiskProfile: 'balanced', aiSizing: 'dynamic', aiDailyCap: 80,
    size: 100, exposure: 100, stop: 5, trailingStop: 3, take: 12, dailyLoss: 6, cooldown: 2
  });
  assert.equal(auto.ai, true);
  assert.equal(auto.aiWakeMode, 'smart');
  assert.equal(auto.aiSizing, 'dynamic');
  const flatBars = Array.from({ length: 20 }, (_, i) => ({ t: new Date(Date.now() - (20 - i) * 900000).toISOString(), o: 100, h: 100.1, l: 99.9, c: 100, v: 100 }));
  // Initial wake always triggers; immediate quiet bar does not wake; 0.8% move wakes
  assert.equal(shouldWakeAutonomousAI(flatBars, 0).wake, true);
  assert.equal(shouldWakeAutonomousAI(flatBars, Date.now() - 60000).wake, false);
  const movedBars = [...flatBars.slice(0, -1), { ...flatBars.at(-1), o: 100, c: 100.9 }];
  assert.equal(shouldWakeAutonomousAI(movedBars, Date.now() - 60000).wake, true);
  // Hard stop-loss still fires deterministically without AI
  const account = { equity: 10000, cash: 5000, dayStart: 10000, exposure: 5000 };
  const hardStop = decision(auto, flatBars.map(b => b.c), account, { qty: 1, entry: 100 }, 94, null, { bars: flatBars, warmedUp: true });
  assert.equal(hardStop?.protective, true);
  assert.equal(hardStop?.side, 'sell');
  // assessSignal parses dynamic allocationPct and includes fee cost
  let captured;
  const out = await assessSignal({ name: 'Gemini', key: 'k', model: 'gemini-2.5-flash' }, 'BTC/USD', 'buy', movedBars, async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ side: 'buy', allocationPct: 50, rationale: 'Scaling 50% into breakout.' }) }] } }] }) };
  }, { aiFreeRoam: true, aiRiskProfile: 'balanced', aiSizing: 'dynamic', roundTripFeeBps: 50 });
  assert.equal(out.side, 'buy');
  assert.equal(out.allocationPct, 50);
  assert.match(captured.systemInstruction.parts[0].text, /50 bps/);
});

async function withDemo(run, mockAI, env = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'fasttrader-test-'));
  const preload = mockAI ? ['--import=data:text/javascript,' + encodeURIComponent(`
    const request = globalThis.fetch;
    globalThis.fetch = (url, options) => String(url).startsWith('https://generativelanguage.googleapis.com/')
      ? request(process.env.MOCK_GEMINI_URL, { ...options, headers: { 'Content-Type': 'application/json' } })
      : request(url, options);
  `)] : [];
  const child = spawn(process.execPath, [...preload, fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd, env: { ...process.env, PORT: '0', FASTTRADER_MODE: 'demo', GEMINI_API_KEY: mockAI ? 'test-key' : '', OPENAI_API_KEY: '', MOCK_GEMINI_URL: mockAI ?? '',
      FASTTRADER_SIGNUP_CODE: '', WORKER_SHARED_SECRET: '', FASTTRADER_AUTH: '', FASTTRADER_HOST: '127.0.0.1', FASTTRADER_DATA_DIR: '.fasttrader', ...env },
    stdio: ['ignore','pipe','pipe']
  });
  const stopped = new Promise(resolve => child.once('close', resolve));
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  async function until(callback, max = 13000) {
    const deadline = Date.now() + max;
    while (Date.now() < deadline) {
      const value = await callback();
      if (value) return value;
      await delay(150);
    }
    throw Error('Timed out. ' + output);
  }
  let url;
  child.stdout.on('data', chunk => { url ||= String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; });
  try {
    await until(() => url);
    const api = async (route, data) => {
      const res = await fetch(url + '/api/' + route, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : undefined);
      const result = await res.json();
      assert.ok(res.ok, result.error);
      return result;
    };
    await run(api, until, url);
  } finally {
    child.kill();
    await stopped;
    await rm(cwd,{recursive:true,force:true});
  }
}

test('screen, version, replay and execute a demo strategy, then pause safely through feed and broker outages', { timeout: 95000 }, async () => {
  await withDemo(async (api, until) => {
    const initial = await api('state');
    const stock = initial.market.find(item => item.symbol === 'SPY');
    assert.ok(stock.price > 0 && stock.volume > 0);
    assert.equal(stock.freshness, 'simulated');
    const draft = {...defaults,id:'default',baseVersion:1,entry:0,exit:0,period:2,mutation:randomUUID()};
    const version = await api('strategy', draft);
    assert.deepEqual(await api('strategy', draft), version);
    assert.equal(version.version, 2);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const start = new Date(Date.now() - 172800000).toISOString().slice(0,10);
    const run = await api('backtest',{id:version.id,version:version.version,start,end,capital:100000,fees:1,slippage:2});
    assert.ok((await api('state')).runs.find(r=>r.id===run.id).trades.length > 0);
    await api('demo',{feed:true});
    await assert.rejects(api('bot',{id:version.id,version:version.version,action:'running'}), /Set a bot budget/);
    await api('bot',{id:version.id,version:version.version,action:'running',budget:650});
    let snapshot = await until(async () => {const s=await api('state');return s.feed==='offline'&&s.bots.default.status.startsWith('Waiting')&&s;});
    assert.equal(snapshot.orders.length,0);
    await api('demo',{broker:true});
    snapshot = await until(async () => {const s=await api('state');return s.broker==='offline'&&s.bots.default.status.startsWith('Waiting')&&s;});
    assert.equal(snapshot.orders.length,0);
    await api('demo',{});
    // No browser or API requests are needed to drive the worker.
    await delay(6000);
    snapshot = await until(async () => {const s=await api('state');return s.orders.some(o=>o.status==='filled')&&s;},45000);
    assert.equal(snapshot.orders.at(-1).side,'buy');
    assert.ok(snapshot.signals.length > 0);
    assert.ok(snapshot.orders.length > 1 || snapshot.positions.some(p=>p.symbol==='SPY'));
    assert.notEqual(snapshot.account.cash, initial.account.cash);
    assert.equal(snapshot.bots.default.budget,650);
    assert.ok(snapshot.orders.filter(order=>order.side==='buy').every(order=>order.filled===1&&order.price<=650));
    assert.ok(snapshot.botSessions.default.bought>0);
    assert.ok(snapshot.botSessions.default.invested<=650);
    assert.equal(new Set(snapshot.orders.map(o=>o.client)).size,snapshot.orders.length);
    await api('bot',{id:version.id,version:version.version,action:'stopped'});
    assert.equal((await api('state')).bots.default.desired,'stopped');

    await api('demo',{feed:true});
    const qqq = await api('strategy',{...defaults,name:'QQQ Momentum',symbol:'QQQ'});
    const spy = await api('strategy',{...defaults,name:'Second SPY'});
    await api('bot',{id:version.id,version:version.version,action:'running'});
    const launch = {id:qqq.id,version:qqq.version,action:'running',create:true,budget:650};
    await api('bot',launch);
    await assert.rejects(api('bot',launch), /already has a bot/);
    await assert.rejects(api('bot',{id:spy.id,version:spy.version,action:'running',create:true,budget:650}), /existing SPY bot/);
    snapshot = await api('state');
    assert.equal(Object.values(snapshot.bots).filter(bot => bot.desired === 'running').length, 2);
    const qqqCommand = {id:qqq.id,version:qqq.version};
    await api('bot',{...qqqCommand,action:'paused'});
    assert.equal((await api('state')).bots[qqq.id].desired,'paused');
    await api('bot',{...qqqCommand,action:'running'});
    await api('bot',{...qqqCommand,action:'stopped'});
    snapshot = await api('state');
    assert.equal(snapshot.bots[qqq.id].desired,'stopped');
    assert.equal(snapshot.bots.default.desired,'running');
    // Top up additional funds while bot is running
    const topped = await api('bot',{topUp:true,id:version.id,addFunds:350});
    assert.equal(topped.budget, 1000);
    // Delete bot (without liquidating QQQ, and deleting SPY bot)
    const delQqq = await api('bot', { delete: true, id: qqq.id, liquidate: false });
    assert.equal(delQqq.deleted, qqq.id);
    assert.equal(delQqq.liquidated, false);
    assert.equal((await api('state')).bots[qqq.id], undefined);
    // Manual liquidation closes open position if held, then delete bot
    const cur = await api('state');
    if (cur.positions.some(p => p.symbol === 'SPY' && p.qty > 0)) {
      const delSpy = await api('bot', { delete: true, id: version.id, liquidate: true });
      assert.equal(delSpy.deleted, version.id);
      assert.equal(delSpy.liquidated, true);
      assert.equal(delSpy.order.side, 'sell');
      assert.ok(!(await api('state')).positions.some(p => p.symbol === 'SPY' && p.qty > 0));
      assert.equal((await api('state')).bots[version.id], undefined);
    }
  });
});

test('saved stock rules can launch a budgeted crypto bot without changing the source strategy', { timeout: 70000 }, async () => {
  await withDemo(async (api, until) => {
    const initial = await api('state');
    const pair = initial.market.find(item => item.symbol === 'BTC/USD');
    assert.equal(pair.assetClass,'crypto');
    assert.equal(pair.freshness,'simulated');
    assert.ok(pair.volume > 0 && pair.eligible);
    const source = await api('strategy',{...defaults,name:'SPY rules template',symbol:'SPY',period:2,entry:0});
    const startBot = {id:source.id,version:source.version,action:'running',symbol:'SPY',instrument:'BTC/USD',create:true};
    await assert.rejects(api('bot',{...startBot,symbol:'BTC/USD',budget:120}), /does not match/);
    await assert.rejects(api('bot',{...startBot,instrument:'UNSUPPORTED/USD',budget:120}), /supported asset/);
    await assert.rejects(api('bot',startBot), /Set a bot budget/);
    assert.equal((await api('state')).strategies.length,initial.strategies.length+1);
    const seed = await api('bot',{...startBot,budget:5});
    assert.equal(seed.symbol,'BTC/USD');
    assert.notEqual(seed.id,source.id);
    const configured = await api('state');
    assert.equal(configured.strategies.find(s=>s.id===source.id).symbol,'SPY');
    const strategy = configured.strategies.find(s=>s.id===seed.id);
    assert.equal(strategy.sourceStrategy.id,source.id);
    assert.equal(strategy.period,source.period);
    assert.equal(strategy.entry,source.entry);
    await assert.rejects(api('bot',{...startBot,budget:120}), /already uses this strategy/);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const start = new Date(Date.now() - 172800000).toISOString().slice(0,10);
    const run = await api('backtest',{id:strategy.id,version:strategy.version,start,end,capital:1000,fees:1,slippage:2});
    assert.ok((await api('state')).runs.find(item=>item.id===run.id).trades.some(trade=>trade.side==='buy'&&trade.qty>0&&trade.qty<1));
    const input = {id:strategy.id,version:strategy.version};
    await assert.rejects(api('bot',{...input,action:'running',symbol:'SPY',budget:120}), /does not match/);
    const waiting = await until(async()=>{
      const s=await api('state');
      return s.bots[strategy.id].lastEvaluation?.direction==='hold'&&s;
    });
    assert.match(waiting.bots[strategy.id].lastEvaluation.rationale,/minimum order/);
    assert.equal(waiting.orders.length,0);
    await api('bot',{...input,action:'paused'});
    const launched = await api('bot',{...input,action:'running',symbol:'BTC/USD',budget:120});
    assert.equal(launched.symbol,'BTC/USD');
    const snapshot = await until(async()=>{
      const s=await api('state');
      return s.orders.some(o=>o.symbol==='BTC/USD'&&o.status==='filled'&&o.side==='buy')&&s;
    },45000);
    const buy = snapshot.orders.find(o=>o.symbol==='BTC/USD'&&o.side==='buy');
    assert.ok(buy.qty>0&&buy.qty<1);
    assert.ok(buy.qty*buy.price<=120);
    assert.ok(snapshot.botSessions[strategy.id].bought>0);
    assert.ok(snapshot.signals.some(signal=>signal.strategyId===strategy.id&&signal.symbol==='BTC/USD'));
    assert.ok(snapshot.orders.every(order=>order.symbol==='BTC/USD'));
  });
});

test('AI bots send isolated confirmations concurrently and pausing discards an in-flight approval', { timeout: 65000 }, async () => {
  const requests = new Map();
  const gemini = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
    requests.set(input.symbol, { input, res });
  });
  await new Promise(resolve => gemini.listen(0, '127.0.0.1', resolve));
  const approve = (symbol) => {
    const { input, res } = requests.get(symbol);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: JSON.stringify({ side: input.proposedSide, rationale: 'Confirmed momentum' }) }
    ] } }] }));
  };
  try {
    await withDemo(async (api, until) => {
      const symbols = ['SPY', 'QQQ', 'AAPL', 'NVDA'];
      const bots = await Promise.all(symbols.map(symbol => api('strategy', { ...defaults, name: symbol, symbol, period: 2, entry: 0, ai: true })));
      for (const bot of bots) await api('bot', { id: bot.id, version: bot.version, action: 'running', budget:650 });
      await until(() => requests.size >= 3, 45000);
      assert.equal(requests.size, 3);
      assert.deepEqual([...requests.keys()].sort(), symbols.slice(0, 3).sort());
      assert.notDeepEqual(requests.get('SPY').input.closes, requests.get('QQQ').input.closes);
      assert.equal(requests.get('SPY').input.closes.length, 20);
      await api('bot', { id: bots[0].id, version: bots[0].version, action: 'paused' });
      approve('SPY');
      approve('QQQ');
      await until(() => requests.has('NVDA'));
      const snapshot = await until(async () => {
        const state = await api('state');
        return state.orders.some(order => order.symbol === 'QQQ' && order.status === 'filled') && state;
      });
      assert.equal(snapshot.bots[bots[0].id].desired, 'paused');
      assert.ok(!snapshot.orders.some(order => order.symbol === 'SPY'));
      assert.ok(!snapshot.signals.some(signal => signal.symbol === 'SPY'));
    }, 'http://127.0.0.1:' + gemini.address().port);
  } finally {
    gemini.closeAllConnections();
    await new Promise(resolve => gemini.close(resolve));
  }
});

test('offline navigation can reopen the cached shell while API data stays network-only', async () => {
  const handlers = {};
  const source = await readFile(new URL('./public/sw.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    self: { addEventListener: (event, handler) => { handlers[event] = handler; } },
    URL,
    location: { origin: 'http://127.0.0.1:3000' },
    fetch: async () => { throw Error('Offline'); },
    caches: { match: async key => new Response(key === '/' ? 'FastTrader shell' : 'asset') }
  });
  let response;
  const request = path => ({ url: 'http://127.0.0.1:3000' + path, method: 'GET', mode: 'navigate' });
  handlers.fetch({ request: request('/'), respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'FastTrader shell');
  handlers.fetch({ request: {...request('/api/state'), mode:'cors'}, respondWith: () => assert.fail('API snapshots must bypass the shell cache') });
  handlers.fetch({ request: request('/api/state'), respondWith: () => assert.fail('API navigations must bypass the shell cache') });
});

test('the hosted bridge and worker enforce owner sign-up, authentication and sign-out', { timeout: 20000 }, async () => {
  const shared = randomUUID();
  const setup = randomUUID();
  const origin = 'https://fasttrader.example';
  const env = { WORKER_SHARED_SECRET: shared, FASTTRADER_WORKER_URL: 'https://worker.example' };
  await withDemo(async (_, _until, worker) => {
    const send = (route, data, cookie, requestOrigin = origin) => {
      const options = { headers: {} };
      if (cookie) options.headers.Cookie = cookie;
      if (data) {
        options.method = 'POST';
        options.headers.Origin = requestOrigin;
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
      }
      return handleBridge(new Request(origin + '/api/bridge?route=' + route, options), env, (target, init) => {
        assert.equal(target.origin, env.FASTTRADER_WORKER_URL);
        assert.equal(init.headers.get('x-fasttrader-worker-secret'), shared);
        return fetch(worker + target.pathname, init);
      });
    };
    const owner = { email:'owner@example.com', password:'test-password-for-fasttrader' };
    const signup = { ...owner, action:'signup', code:setup };
    assert.equal((await fetch(worker + '/api/state')).status, 403);
    assert.equal((await send('state')).status, 401);
    assert.deepEqual(await (await send('auth')).json(), { required:true, authenticated:false, canSignup:true });
    assert.equal((await send('auth', signup, null, 'https://another.example')).status, 403);
    assert.equal((await send('auth', { ...signup, code:'wrong' })).status, 403);
    const created = await send('auth', signup);
    assert.equal(created.status, 200);
    const setCookie = created.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
    const cookie = setCookie.split(';')[0];
    assert.deepEqual(await created.json(), { required:true, authenticated:true, canSignup:false });
    assert.equal((await send('auth', signup)).status, 403);
    assert.equal((await send('bot', { id:'default', version:1, action:'running', budget:650 })).status, 401);
    assert.equal((await send('bot', { id:'default', version:1, action:'running', budget:650 }, cookie)).status, 200);
    const snapshot = await send('state', null, cookie);
    assert.equal(snapshot.headers.get('cache-control'), 'no-store');
    assert.equal((await snapshot.json()).bots.default.desired, 'running');
    assert.equal((await send('auth', { action:'logout' }, cookie)).status, 200);
    assert.equal((await send('state', null, cookie)).status, 401);
    assert.equal((await send('auth', { ...owner, action:'login', password:'wrong' })).status, 401);
    assert.equal((await send('auth', { ...owner, action:'login' })).status, 200);
  }, null, { FASTTRADER_SIGNUP_CODE: setup, WORKER_SHARED_SECRET: shared });
});
