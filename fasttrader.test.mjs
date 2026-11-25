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
import { defaults, decision, replay, downsampleCurve, botLedger, contiguousBars, aggregateBars, closedStrategyBars, computeATR, computeADX, computeVWAP, computeCMF, classifyRegime, detectCandlestickPatterns, detectChartPatterns, isOverextendedBuy, computeCandleStopPct, indicatorValue, strategy, strategyWindow, evaluateRuleSet, shouldWakeAutonomousAI } from './engine.mjs';
import { signalProvider, assessSignal } from './signal-ai.mjs';
import { createTelegram } from './telegram.mjs';
import { handleBridge } from './api/bridge.js';
import { strategyPlaybooks } from './public/strategy-playbooks.mjs';
import { replayPortfolio } from './portfolio.mjs';

test('portfolio nets opposing orders and preserves each strategy allocation', () => {
  const condition = (op, value) => ({ left: { indicator: 'close' }, op, right: { indicator: 'number', value } });
  const base = { ...defaults, mode: 'custom', size: 100, exposure: 100, take: 50 };
  const a = { ...base, name: 'A', rules: { entry: [condition('lt', 105)], exit: [condition('gte', 110)] } };
  const b = { ...base, name: 'B', rules: { entry: [condition('gte', 110)], exit: [] } };
  const bars = [100, 100, 110, 110].map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), o: i === 2 ? 100 : c, c
  }));
  const result = replayPortfolio([a, b], bars, { capital: 1000, split: 0.5, fees: 0, slippage: 0 });
  assert.deepEqual(result.orders.map(({ side, qty }) => [side, qty]), [['buy', 5], ['sell', 1]]);
  assert.equal(result.internalQty, 4);
  assert.deepEqual(result.strategies.map(item => item.qty), [0, 4]);
  assert.equal(result.final, 1050);
});

test('strategy waits for the timeframe to close and treats max hold as a protective exit', () => {
  const bars = ['12:00', '12:14', '12:15'].map((stamp, index) => ({
    t: `2026-11-23T${stamp}:00.000Z`, o: 100, h: 103, l: 99, c: 100 + index
  }));
  assert.deepEqual(closedStrategyBars(bars, '15Min', Date.parse('2026-11-23T12:14:59Z')), []);
  const closed = closedStrategyBars(bars, '15Min', Date.parse('2026-11-23T12:15:00Z'));
  assert.deepEqual(closed.map(bar => [bar.t, bar.c]), [[bars[0].t, 101]]);
  const proposal = decision(
    { ...defaults, maxHoldBars: 2, ai: true }, [], { equity: 1000, dayStart: 1000 },
    { entry: 100, qty: 1 }, 100, null, { holdBars: 2, warmedUp: false }
  );
  assert.equal(proposal.side, 'sell');
  assert.equal(proposal.protective, true);
});

test('Candlestick Trading Bible patterns, 4H/1D timeframes, Fib/SR confluence, and 1-2% risk sizing work end-to-end', () => {
  const hourly = Array.from({ length: 8 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 5, 1, i, 0)).toISOString(),
    o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 10
  }));
  const fourHour = aggregateBars(hourly, '4Hour');
  assert.equal(fourHour.length, 2);
  assert.equal(fourHour[0].o, 100);
  assert.equal(fourHour[0].c, 104);
  assert.equal(fourHour[0].v, 40);

  const swingBars = Array.from({ length: 18 }, (_, i) => {
    const base = i <= 2 ? 102 - i : i <= 12 ? 100 + (i - 2) * 2 : 120 - (i - 12) * 2.2;
    return {
      t: new Date(Date.UTC(2026, 5, 2, i, 0)).toISOString(),
      o: base + 0.3, h: i === 12 ? 120 : base + 0.8, l: i === 2 ? 100 : base - 0.8, c: base, v: 100
    };
  });
  swingBars.push({
    t: new Date(Date.UTC(2026, 5, 2, 18, 0)).toISOString(),
    o: 109.2, h: 109.8, l: 106.0, c: 109.5, v: 180
  });
  const pinCheck = detectCandlestickPatterns(swingBars);
  assert.equal(pinCheck.flags.bullish_pin_bar, 1);
  assert.ok(pinCheck.active.includes('bullish_pin_bar'));
  const fib = indicatorValue(swingBars, { indicator: 'fib_retracement', period: 19 });
  assert.ok(fib >= 45 && fib <= 62, `Expected Fib retracement in Golden Zone, got ${fib}`);
  const srRoom = indicatorValue(swingBars, { indicator: 'sr_room_ratio', period: 19 });
  assert.ok(srRoom >= 1, `Expected positive S/R room ratio, got ${srRoom}`);

  const fakeyBars = [
    ...swingBars.slice(0, 15),
    { t: '2026-06-03T00:00:00Z', o: 112, h: 115, l: 108, c: 110, v: 120 },
    { t: '2026-06-03T04:00:00Z', o: 111, h: 113, l: 109.5, c: 110.5, v: 90 },
    { t: '2026-06-03T08:00:00Z', o: 110, h: 112.5, l: 107.5, c: 112.0, v: 220 }
  ];
  const fakeyPat = detectCandlestickPatterns(fakeyBars);
  assert.equal(fakeyPat.flags.inside_bar_fakey, 1);
  assert.equal(fakeyPat.setupLow, 107.5);

  const bibleStrat = strategy({
    ...defaults, name: 'Bible Pin Bar', symbol: 'SPY', mode: 'custom', timeframe: '1Hour',
    sizeMode: 'risk', riskPct: 1.5, candleStop: true, exposure: 100, stop: 5, take: 12,
    rules: {
      entryLogic: 'all', exitLogic: 'any',
      entry: [
        { left: { indicator: 'bullish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } },
        { left: { indicator: 'fib_retracement', period: 17 }, op: 'gte', right: { indicator: 'number', value: 45 } }
      ],
      exit: [{ left: { indicator: 'bearish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } }]
    }
  });
  const tailStopPct = computeCandleStopPct(bibleStrat, swingBars, 109.5);
  assert.ok(tailStopPct > 3 && tailStopPct < 5, `Expected ~3.4% pattern-tail stop, got ${tailStopPct}`);
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  const buyProp = decision(bibleStrat, swingBars.map(b => b.c), account, null, 109.5, null, { bars: swingBars, warmedUp: true });
  assert.equal(buyProp?.side, 'buy');
  assert.ok(Number.isFinite(buyProp.stopPct));
  const dollarRisk = buyProp.qty * 109.5 * (buyProp.stopPct / 100);
  assert.ok(dollarRisk <= 155 && dollarRisk >= 120, `Expected ~$150 risk, got $${dollarRisk}`);

  const stopExit = decision(bibleStrat, swingBars.map(b => b.c), account, { qty: buyProp.qty, entry: 109.5, stopPct: buyProp.stopPct }, 105.2, null, { bars: swingBars, warmedUp: true, stopPct: buyProp.stopPct });
  assert.equal(stopExit?.side, 'sell');
  assert.equal(stopExit?.protective, true);
  assert.match(stopExit?.rationale, /Pattern-tail stop-loss/);
});

test('Classical TA chart patterns (Double Bottom, Bull Flag, Ascending Triangle, Gaps), CMF(20), and Anti-Chase guard work deterministically', () => {
  // 1. Double Bottom ("W") + CMF(20) accumulation + Right-Trough stop anchor
  const wPrices = [
    112, 110, 108, 105, 100, // L1 trough at idx 4 (low 99.5)
    103, 106, 108, 106, 103, // middle peak neckline at idx 7 (high 108.5)
    100.2, 102, 105, 107, 108, // L2 trough at idx 10 (low 99.8)
    107.5, 108.0, 108.2, 108.1, 108.3
  ];
  const wBars = wPrices.map((c, i) => ({
    t: new Date(Date.UTC(2026, 6, 1, i, 0)).toISOString(),
    o: c - 0.3,
    h: i === 7 ? 108.5 : c + 0.3,
    l: i === 4 ? 99.5 : i === 10 ? 99.8 : c - 0.5,
    c,
    v: 100
  }));
  // Add 5 warmup bars before W and 1 closed Neckline Breakout bar on heavy volume closing near high
  const prefix = Array.from({ length: 5 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 5, 30, 19 + i, 0)).toISOString(),
    o: 114, h: 115, l: 112, c: 114.5, v: 100
  }));
  const wBreakout = [
    ...prefix,
    ...wBars,
    { t: new Date(Date.UTC(2026, 6, 1, 20, 0)).toISOString(), o: 108.2, h: 110.2, l: 108.1, c: 110.0, v: 220 }
  ];
  const chartW = detectChartPatterns(wBreakout);
  assert.equal(chartW.flags.double_bottom, 1);
  assert.equal(chartW.setupLow, 99.8);
  const cmf = computeCMF(wBreakout, 20);
  assert.ok(cmf !== null && cmf > 0, `Expected positive CMF(20) accumulation, got ${cmf}`);

  // 2. Bull Flag continuation (flagpole surge + tight pullback + breakout)
  const flagBars = [
    ...Array.from({ length: 10 }, (_, i) => ({ t: new Date(Date.UTC(2026, 6, 2, i, 0)).toISOString(), o: 100, h: 100.5, l: 99.5, c: 100.2, v: 100 })),
    // 5-bar flagpole surge from 100 -> 110
    ...[102, 104, 106, 108, 110].map((c, i) => ({ t: new Date(Date.UTC(2026, 6, 2, 10 + i, 0)).toISOString(), o: c - 1.8, h: c + 0.3, l: c - 2, c, v: 250 })),
    // 5-bar tight downward flag consolidating 109.5 -> 107.5 (max high 109.6)
    ...[109.2, 108.8, 108.4, 108.0, 108.3].map((c, i) => ({ t: new Date(Date.UTC(2026, 6, 2, 15 + i, 0)).toISOString(), o: c + 0.2, h: c + 0.4, l: c - 0.4, c, v: 80 })),
    // Breakout bar closing above flagHigh (109.6)
    { t: new Date(Date.UTC(2026, 6, 2, 20, 0)).toISOString(), o: 108.5, h: 111.2, l: 108.4, c: 111.0, v: 260 }
  ];
  assert.equal(detectChartPatterns(flagBars).flags.bull_flag, 1);

  // 3. Exhaustion Gap + Anti-Chase ("Greater Fool") guard blocks overextended buys
  const parabolic = Array.from({ length: 22 }, (_, i) => {
    const c = 100 + i * 1.5;
    return { t: new Date(Date.UTC(2026, 6, 3, i, 0)).toISOString(), o: c - 1, h: c + 0.2, l: c - 1.2, c, v: 100 };
  });
  parabolic.push({ t: new Date(Date.UTC(2026, 6, 3, 22, 0)).toISOString(), o: 136, h: 137, l: 133, c: 133.2, v: 300 });
  assert.equal(detectChartPatterns(parabolic).flags.exhaustion_gap, 1);
  assert.equal(isOverextendedBuy(parabolic), true);
  const guarded = strategy({
    ...defaults, name: 'Guarded Momentum', symbol: 'SPY', mode: 'momentum', period: 10, entry: 0.1, antiChase: true
  });
  const account = { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 };
  assert.equal(decision(guarded, parabolic.map(b => b.c), account, null, 133.2, null, { bars: parabolic, warmedUp: true }), null);
});

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
  assert.equal(decision(rules, [100, 110], { equity: 9500, dayStart: 10000, cash: 9500, exposure: 0 }, null, 110), null);
});

test('bot budget tracks fills and reduces buying capacity after a realized loss', () => {
  const fill = (side, filled, price, time) => ({ symbol: 'SPY', side, filled, price, t: '2026-10-01T12:0' + time + ':00Z' });
  const buy = fill('buy', 4, 100, 0);
  const sell = fill('sell', 2, 70, 1);
  const book = botLedger([sell, buy], 'SPY', 500);
  assert.deepEqual({ qty: book.qty, invested: book.invested, realized: book.realized, available: book.available },
    { qty: 2, invested: 200, realized: -60, available: 240 });
  assert.equal(botLedger([buy, fill('sell', 4, 110, 1)], 'SPY', 500).available, 500);
  assert.equal(botLedger([{ ...buy, price: null }], 'SPY', 500).available, 0);
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
  // Higher-timeframe 1H EMA filter blocks entries in downtrend & replay produces 70/30 walk-forward split
  const htfStrat = strategy({ ...defaults, period: 2, entry: 0, htfEma: 3 });
  const htfDown = [
    { t: '2026-10-01T10:00:00Z', o: 120, h: 121, l: 119, c: 120 },
    { t: '2026-10-01T11:00:00Z', o: 115, h: 116, l: 114, c: 115 },
    { t: '2026-10-01T12:00:00Z', o: 110, h: 111, l: 109, c: 105 }
  ];
  assert.equal(decision(htfStrat, [100, 105], { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 }, null, 105, null, { warmedUp: true, htfBars: htfDown }), null);
  const wfBars = Array.from({ length: 30 }, (_, i) => ({
    t: new Date(Date.parse('2026-10-01T12:00:00Z') + i * 60000).toISOString(),
    o: 100 + i * 0.5, h: 101 + i * 0.5, l: 99.5 + i * 0.5, c: 100.5 + i * 0.5, v: 500
  }));
  const wfRes = replay({ ...defaults, period: 2, entry: 0 }, wfBars, { capital: 10000, fees: 0, slippage: 0 });
  assert.ok(wfRes.metrics.walkForward?.inSample);
  assert.ok(wfRes.metrics.walkForward?.outOfSample);
  // Wilder ADX, Session VWAP, Keltner, RVOL, classifyRegime, and minAdx chop guard
  assert.ok(computeADX(wfBars, 14) > 25);
  assert.ok(computeVWAP(wfBars) > 100);
  assert.ok(indicatorValue(wfBars, { indicator: 'keltner_upper', period: 20 }) > wfBars[10].c);
  assert.equal(indicatorValue(wfBars, { indicator: 'rvol', period: 20 }), 1);
  assert.equal(classifyRegime(wfBars).regime, 'TRENDING_BULL');
  const flatChop = Array.from({ length: 25 }, (_, i) => ({
    t: new Date(Date.parse('2026-10-01T12:00:00Z') + i * 60000).toISOString(),
    o: 100, h: 100.2, l: 99.8, c: i % 2 === 0 ? 100.1 : 99.9, v: 500
  }));
  const chopProtected = strategy({ ...defaults, period: 2, entry: 0, minAdx: 22 });
  assert.equal(decision(chopProtected, flatChop.map(b => b.c), { equity: 10000, cash: 10000, dayStart: 10000, exposure: 0 }, null, 100.1, null, { warmedUp: true, bars: flatChop }), null);
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
  const boBuy = decision(bo, [100, 101, 102, 103, 105], account, null, 105);
  assert.equal(boBuy?.side, 'buy');
  const wickBars = mins.slice(0, 5).map((bar, index) => ({ ...bar, h: 120, l: 80, c: 100 + index }));
  assert.equal(decision(bo, wickBars.map(bar => bar.c), account, null, 104, null, { bars: wickBars }), null);
  wickBars.at(-1).c = 95;
  assert.equal(decision({ ...bo, stop: 20 }, wickBars.map(bar => bar.c), account, { qty: 1, entry: 100 }, 95, null, { bars: wickBars }), null);
  const atrRule = { ...defaults, stop: 10, atrStop: 1 };
  const atrExit = decision(atrRule, [100, 98], account, { qty: 10, entry: 100 }, 98.5, null, { atr: 1 });
  assert.equal(atrExit?.side, 'sell');
  assert.equal(atrExit?.stopLoss, true);
});

test('custom crossings can evaluate a 200-period indicator', () => {
  const s = strategy({
    ...defaults, mode: 'custom', rules: {
      entry: [{
        left: { indicator: 'rsi', period: 200 }, op: 'crosses_above', right: { indicator: 'number', value: 0 }
      }]
    }
  });
  const bars = Array.from({ length: 202 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), c: i < 201 ? 400 - i : 500
  }));
  const window = strategyWindow(s, bars);
  assert.equal(window.length, 202);
  assert.equal(evaluateRuleSet(window, s.rules, 'entry').pass, true);
});

test('replay reduces the next entry budget by realized losses', () => {
  const s = strategy({
    ...defaults, mode: 'custom', cooldown: 0, stop: 10, period: 2, rules: {
      entry: [{
        left: { indicator: 'close' }, op: 'gt', right: { indicator: 'number', value: 0 }
      }]
    }
  });
  const bars = Array.from({ length: 5 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), o: 100, h: 100, l: i === 2 ? 89 : 100, c: 100, v: 10
  }));
  const result = replay(s, bars, { capital: 10000, budget: 500, fees: 0, slippage: 0 });
  assert.deepEqual(result.trades.map(({ side, qty }) => [side, qty]), [['buy', 5], ['sell', 5], ['buy', 4]]);
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
  assert.equal(typeof tg.startPolling, 'function');
  assert.equal(typeof tg.stopPolling, 'function');
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

async function withWorker(run, mockAI, env = {}, preloadSource = '') {
  const cwd = await mkdtemp(join(tmpdir(), 'fasttrader-test-'));
  const preload = mockAI ? ['--import=data:text/javascript,' + encodeURIComponent(`
    const request = globalThis.fetch;
    globalThis.fetch = (url, options) => String(url).startsWith('https://generativelanguage.googleapis.com/')
      ? request(process.env.MOCK_GEMINI_URL, { ...options, headers: { 'Content-Type': 'application/json' } })
      : request(url, options);
  `)] : [];
  if (preloadSource) preload.push('--import=data:text/javascript,' + encodeURIComponent(preloadSource));
  const child = spawn(process.execPath, [...preload, fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd, env: {
      ...process.env, PORT: '0', FASTTRADER_MODE: 'demo', GEMINI_API_KEY: mockAI ? 'test-key' : '', OPENAI_API_KEY: '', MOCK_GEMINI_URL: mockAI ?? '',
      FASTTRADER_SIGNUP_CODE: '', WORKER_SHARED_SECRET: '', FASTTRADER_AUTH: '', FASTTRADER_HOST: '127.0.0.1', FASTTRADER_DATA_DIR: '.fasttrader', ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
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
      const res = await fetch(url + '/api/' + route, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : undefined);
      const result = await res.json();
      assert.ok(res.ok, result.error);
      return result;
    };
    await run(api, until, url);
  } finally {
    child.kill();
    await stopped;
    await rm(cwd, { recursive: true, force: true });
  }
}

test('portfolio replay compares standalone runs and the forward paper session can pause and resume', async () => {
  await withWorker(async (api, until) => {
    const a = await api('strategy', { ...defaults, name: 'Portfolio A' });
    const b = await api('strategy', { ...defaults, name: 'Portfolio B', mode: 'mean_reversion' });
    const config = {
      versions: [a, b].map(s => s.id + '@' + s.version), capital: 10000, split: 0.5, fees: 1, slippage: 2
    };
    const result = await api('portfolio-replay', config);
    assert.equal(result.symbol, 'SPY');
    assert.equal(result.strategies.length, 2);
    assert.ok(Number.isFinite(result.final));
    assert.equal(result.benchmarks.length, 2);
    await api('portfolio-session', { ...config, action: 'start' });
    await until(async () => (await api('state')).paperPortfolio.lastBar);
    await api('portfolio-session', { action: 'pause' });
    const paused = (await api('state')).paperPortfolio;
    assert.equal(paused.running, false);
    await api('portfolio-session', { action: 'resume' });
    assert.equal((await api('state')).paperPortfolio.running, true);
  });
});

test('strategy preview backfills hourly history and evaluates the selected rule engine', async () => {
  await withWorker(async api => {
    const draft = {
      ...defaults, symbol: 'BTC/USD', timeframe: '1Hour', mode: 'custom', rules: {
        entry: [{
          left: { indicator: 'sma', period: 200 }, op: 'gt', right: { indicator: 'number', value: 0 }
        }]
      }
    };
    const result = await api('strategy-preview', draft);
    assert.equal(result.ready, true);
    assert.equal(result.count, 202);
    assert.equal(result.groups.entry.pass, true);
    assert.match(result.entry, /Custom entry rules matched/);
    assert.ok(Date.parse(result.latest.t) + 3600000 <= Date.now());
  });
});

test('playbook drafts validate and saved replays retain the source playbook', async () => {
  await withWorker(async (api, _until, url) => {
    const module = await fetch(url + '/strategy-playbooks.mjs');
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
    for (const [playbookId, playbook] of Object.entries(strategyPlaybooks)) {
      const draft = { ...defaults, ...playbook.draft, playbookId, mode: 'custom', name: playbook.name, symbol: 'BTC/USD' };
      const saved = await api('strategy', draft);
      assert.equal(saved.playbookId, playbookId);
      assert.deepEqual(saved.rules, draft.rules);
      const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const result = await api('backtest', { id: saved.id, version: saved.version, start, end, capital: 10000, fees: 25, slippage: 5 });
      const snapshot = await api('state');
      assert.equal(snapshot.runs.find(run => run.id === result.id)?.playbookId, playbookId);
    }
  });
});

test('screen, version, replay and execute a demo strategy, then pause safely through feed and broker outages', { timeout: 95000 }, async () => {
  await withWorker(async (api, until) => {
    const initial = await api('state');
    const stock = initial.market.find(item => item.symbol === 'SPY');
    assert.ok(stock.price > 0 && stock.volume > 0);
    assert.equal(stock.freshness, 'simulated');
    const draft = { ...defaults, id: 'default', baseVersion: 1, entry: 0, exit: 0, period: 2, mutation: randomUUID() };
    const version = await api('strategy', draft);
    assert.deepEqual(await api('strategy', draft), version);
    assert.equal(version.version, 2);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
    const run = await api('backtest', { id: version.id, version: version.version, start, end, capital: 100000, fees: 1, slippage: 2 });
    assert.ok((await api('state')).runs.find(r => r.id === run.id).trades.length > 0);
    await api('demo', { feed: true });
    await assert.rejects(api('bot', { id: version.id, version: version.version, action: 'running' }), /Set a bot budget/);
    await api('bot', { id: version.id, version: version.version, action: 'running', budget: 650 });
    let snapshot = await until(async () => { const s = await api('state'); return s.feed === 'offline' && s.bots.default.status.startsWith('Waiting') && s; });
    assert.equal(snapshot.orders.length, 0);
    await api('demo', { broker: true });
    snapshot = await until(async () => { const s = await api('state'); return s.broker === 'offline' && s.bots.default.status.startsWith('Waiting') && s; });
    assert.equal(snapshot.orders.length, 0);
    await api('demo', {});
    // No browser or API requests are needed to drive the worker.
    await delay(6000);
    snapshot = await until(async () => { const s = await api('state'); return s.orders.some(o => o.status === 'filled') && s; }, 45000);
    assert.equal(snapshot.orders.at(-1).side, 'buy');
    assert.ok(snapshot.signals.length > 0);
    assert.ok(snapshot.orders.length > 1 || snapshot.positions.some(p => p.symbol === 'SPY'));
    assert.notEqual(snapshot.account.cash, initial.account.cash);
    assert.equal(snapshot.bots.default.budget, 650);
    assert.ok(snapshot.orders.filter(order => order.side === 'buy').every(order => order.filled === 1 && order.price <= 650));
    assert.ok(snapshot.botSessions.default.bought > 0);
    assert.ok(snapshot.botSessions.default.invested <= 650);
    assert.equal(new Set(snapshot.orders.map(o => o.client)).size, snapshot.orders.length);
    await api('bot', { id: version.id, version: version.version, action: 'stopped' });
    assert.equal((await api('state')).bots.default.desired, 'stopped');

    await api('demo', { feed: true });
    const qqq = await api('strategy', { ...defaults, name: 'QQQ Momentum', symbol: 'QQQ' });
    const spy = await api('strategy', { ...defaults, name: 'Second SPY' });
    await api('bot', { id: version.id, version: version.version, action: 'running' });
    const launch = { id: qqq.id, version: qqq.version, action: 'running', create: true, budget: 650 };
    await api('bot', launch);
    await assert.rejects(api('bot', launch), /already has a bot/);
    await assert.rejects(api('bot', { id: spy.id, version: spy.version, action: 'running', create: true, budget: 650 }), /existing SPY bot/);
    snapshot = await api('state');
    assert.equal(Object.values(snapshot.bots).filter(bot => bot.desired === 'running').length, 2);
    const qqqCommand = { id: qqq.id, version: qqq.version };
    await api('bot', { ...qqqCommand, action: 'paused' });
    assert.equal((await api('state')).bots[qqq.id].desired, 'paused');
    await api('bot', { ...qqqCommand, action: 'running' });
    await api('bot', { ...qqqCommand, action: 'stopped' });
    snapshot = await api('state');
    assert.equal(snapshot.bots[qqq.id].desired, 'stopped');
    assert.equal(snapshot.bots.default.desired, 'running');
    // Top up additional funds while bot is running
    const topped = await api('bot', { topUp: true, id: version.id, addFunds: 350 });
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
  await withWorker(async (api, until) => {
    const initial = await api('state');
    const pair = initial.market.find(item => item.symbol === 'BTC/USD');
    assert.equal(pair.assetClass, 'crypto');
    assert.equal(pair.freshness, 'simulated');
    assert.ok(pair.volume > 0 && pair.eligible);
    const source = await api('strategy', { ...defaults, name: 'SPY rules template', symbol: 'SPY', period: 2, entry: 0 });
    const startBot = { id: source.id, version: source.version, action: 'running', symbol: 'SPY', instrument: 'BTC/USD', create: true };
    await assert.rejects(api('bot', { ...startBot, symbol: 'BTC/USD', budget: 120 }), /does not match/);
    await assert.rejects(api('bot', { ...startBot, instrument: 'UNSUPPORTED/USD', budget: 120 }), /supported asset/);
    await assert.rejects(api('bot', startBot), /Set a bot budget/);
    assert.equal((await api('state')).strategies.length, initial.strategies.length + 1);
    const seed = await api('bot', { ...startBot, budget: 5 });
    assert.equal(seed.symbol, 'BTC/USD');
    assert.notEqual(seed.id, source.id);
    const configured = await api('state');
    assert.equal(configured.strategies.find(s => s.id === source.id).symbol, 'SPY');
    const strategy = configured.strategies.find(s => s.id === seed.id);
    assert.equal(strategy.sourceStrategy.id, source.id);
    assert.equal(strategy.period, source.period);
    assert.equal(strategy.entry, source.entry);
    await assert.rejects(api('bot', { ...startBot, budget: 120 }), /already uses this strategy/);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
    const run = await api('backtest', { id: strategy.id, version: strategy.version, start, end, capital: 1000, fees: 1, slippage: 2 });
    assert.ok((await api('state')).runs.find(item => item.id === run.id).trades.some(trade => trade.side === 'buy' && trade.qty > 0 && trade.qty < 1));
    const input = { id: strategy.id, version: strategy.version };
    await assert.rejects(api('bot', { ...input, action: 'running', symbol: 'SPY', budget: 120 }), /does not match/);
    const waiting = await until(async () => {
      const s = await api('state');
      return s.bots[strategy.id].lastEvaluation?.direction === 'hold' && s;
    });
    assert.match(waiting.bots[strategy.id].lastEvaluation.rationale, /minimum order/);
    assert.equal(waiting.orders.length, 0);
    await api('bot', { ...input, action: 'paused' });
    const launched = await api('bot', { ...input, action: 'running', symbol: 'BTC/USD', budget: 120 });
    assert.equal(launched.symbol, 'BTC/USD');
    const snapshot = await until(async () => {
      const s = await api('state');
      return s.orders.some(o => o.symbol === 'BTC/USD' && o.status === 'filled' && o.side === 'buy') && s;
    }, 45000);
    const buy = snapshot.orders.find(o => o.symbol === 'BTC/USD' && o.side === 'buy');
    assert.ok(buy.qty > 0 && buy.qty < 1);
    assert.ok(buy.qty * buy.price <= 120);
    assert.ok(snapshot.botSessions[strategy.id].bought > 0);
    assert.ok(snapshot.signals.some(signal => signal.strategyId === strategy.id && signal.symbol === 'BTC/USD'));
    assert.ok(snapshot.orders.every(order => order.symbol === 'BTC/USD'));
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
    res.end(JSON.stringify({
      candidates: [{
        finishReason: 'STOP', content: {
          parts: [
            { text: JSON.stringify({ side: input.proposedSide, rationale: 'Confirmed momentum' }) }
          ]
        }
      }]
    }));
  };
  try {
    await withWorker(async (api, until) => {
      const symbols = ['SPY', 'QQQ', 'AAPL', 'NVDA'];
      const bots = await Promise.all(symbols.map(symbol => api('strategy', { ...defaults, name: symbol, symbol, period: 2, entry: 0, ai: true })));
      for (const bot of bots) await api('bot', { id: bot.id, version: bot.version, action: 'running', budget: 650 });
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

test('AI Notepad evaluates excerpts from selected strategy uploads only', async () => {
  let input;
  const gemini = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    input = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      candidates: [{
        finishReason: 'STOP', content: {
          parts: [
            { text: JSON.stringify({ side: 'hold', rationale: 'Waiting for a pullback.' }) }
          ]
        }
      }]
    }));
  });
  await new Promise(resolve => gemini.listen(0, '127.0.0.1', resolve));
  try {
    await withWorker(async (api, until) => {
      const selected = await api('knowledge', { name: 'pullback.md', text: 'Entry: buy after a confirmed pullback.' });
      await api('knowledge', { name: 'unused.txt', text: 'Entry: unselected document marker.' });
      const before = await api('state');
      assert.equal(before.knowledge.length, 2);
      assert.ok(before.knowledge.every(file => !Object.hasOwn(file, 'text')));
      const s = await api('strategy', {
        ...defaults, name: 'Document-only strategy', mode: 'ai_notepad', period: 2, knowledgeIds: [selected.id]
      });
      await api('bot', { id: s.id, version: s.version, action: 'running', budget: 2000 });
      const signal = await until(async () => (await api('state')).signals.find(item => item.strategyId === s.id));
      assert.deepEqual(input.context.knowledge, [
        { name: 'pullback.md', excerpts: ['Entry: buy after a confirmed pullback.'] }
      ]);
      assert.deepEqual(signal.knowledgeSources, ['pullback.md']);
      assert.equal(signal.direction, 'hold');
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
  handlers.fetch({ request: { ...request('/api/state'), mode: 'cors' }, respondWith: () => assert.fail('API snapshots must bypass the shell cache') });
  handlers.fetch({ request: request('/api/state'), respondWith: () => assert.fail('API navigations must bypass the shell cache') });
});

test('the hosted bridge and worker enforce owner sign-up, authentication and sign-out', { timeout: 20000 }, async () => {
  const shared = randomUUID();
  const setup = randomUUID();
  const origin = 'https://fasttrader.example';
  const env = { WORKER_SHARED_SECRET: shared, FASTTRADER_WORKER_URL: 'https://worker.example' };
  await withWorker(async (_, _until, worker) => {
    const send = (route, data, cookie, requestOrigin = origin, extraHeaders = {}) => {
      const options = { headers: { ...extraHeaders } };
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
    const owner = { email: 'owner@example.com', password: 'test-password-for-fasttrader' };
    const signup = { ...owner, action: 'signup', code: setup };
    assert.equal((await fetch(worker + '/api/state')).status, 403);
    assert.equal((await send('state')).status, 401);
    assert.deepEqual(await (await send('auth')).json(), { required: true, authenticated: false, canSignup: true });
    assert.equal((await send('auth', signup, null, 'https://another.example')).status, 403);
    assert.equal((await send('auth', { ...signup, code: 'wrong' })).status, 403);
    const created = await send('auth', signup);
    assert.equal(created.status, 200);
    const setCookie = created.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
    const cookie = setCookie.split(';')[0];
    assert.deepEqual(await created.json(), { required: true, authenticated: true, canSignup: false });
    assert.equal((await send('auth', signup)).status, 403);
    assert.equal((await send('bot', { id: 'default', version: 1, action: 'running', budget: 650 })).status, 401);
    assert.equal((await send('bot', { id: 'default', version: 1, action: 'running', budget: 650 }, cookie)).status, 200);
    // Idempotency-Key deduplicates retried financial mutations (topUp only applied once)
    const idem = randomUUID();
    const top1 = await send('bot', { topUp: true, id: 'default', addFunds: 250 }, cookie, origin, { 'Idempotency-Key': idem });
    const top2 = await send('bot', { topUp: true, id: 'default', addFunds: 250 }, cookie, origin, { 'Idempotency-Key': idem });
    assert.equal(top1.status, 200);
    assert.equal(top2.status, 200);
    assert.equal((await top1.json()).budget, 900);
    assert.equal((await top2.json()).budget, 900);
    const snapshot = await send('state', null, cookie);
    assert.equal(snapshot.headers.get('cache-control'), 'no-store');
    assert.equal(snapshot.headers.get('x-frame-options'), 'DENY');
    const etag = snapshot.headers.get('etag');
    assert.ok(etag);
    assert.equal((await snapshot.json()).bots.default.budget, 900);
    // ETag 304 Not Modified skips payload when unchanged
    const notMod = await send('state', null, cookie, origin, { 'If-None-Match': etag });
    assert.equal(notMod.status, 304);
    // Emergency Kill Switch pauses running bots
    const ks = await send('bot', { killSwitch: true, liquidateAll: false }, cookie);
    assert.equal(ks.status, 200);
    assert.equal((await ks.json()).pausedCount, 1);
    // Change password rotates session cookie and invalidates old password
    const newPass = 'new-strong-password-for-fasttrader';
    const rotated = await send('auth', { action: 'change_password', currentPassword: owner.password, newPassword: newPass }, cookie);
    assert.equal(rotated.status, 200);
    const nextCookie = rotated.headers.get('set-cookie').split(';')[0];
    assert.equal((await send('auth', { action: 'logout' }, nextCookie)).status, 200);
    assert.equal((await send('state', null, nextCookie)).status, 401);
    assert.equal((await send('auth', { ...owner, action: 'login', password: owner.password })).status, 401);
    assert.equal((await send('auth', { ...owner, action: 'login', password: newPass })).status, 200);
  }, null, { FASTTRADER_SIGNUP_CODE: setup, WORKER_SHARED_SECRET: shared });
});


test('Alpaca catalog supports eligible assets and deletion waits for liquidation', async () => {
  await withWorker(async (api, until) => {
    const first = await until(async () => {
      const result = await api('assets', { assetClass: 'us_equity' });
      return !result.partial && result;
    });
    assert.equal(first.total, 36);
    assert.equal(first.items.length, 30);
    const next = await api('assets', { assetClass: 'us_equity', offset: 30 });
    assert.equal(next.items.length, 6);
    assert.ok(next.items.every(asset => !first.items.some(prev => prev.symbol === asset.symbol)));
    const matches = await api('assets', { query: 'ALTERNATIVE', eligible: true });
    assert.deepEqual(matches.items.map(asset => asset.symbol), ['GLD']);
    const crypto = await api('assets', { assetClass: 'crypto' });
    assert.equal(crypto.items.find(asset => asset.symbol === 'DOGE/USD').eligible, true);
    assert.equal(crypto.items.find(asset => asset.symbol === 'DOGE/USDT').eligible, false);
    const indexes = await api('assets', { assetClass: 'us_index' });
    assert.equal(indexes.items[0].eligible, false);
    const saved = await api('strategy', { ...defaults, name: 'Gold strategy', symbol: 'GLD' });
    await api('bot', { id: saved.id, version: saved.version, action: 'running', create: true, instrument: 'DOGE/USD', budget: 100 });
    const snapshot = await api('state');
    assert.ok(snapshot.market.some(asset => asset.symbol === 'DOGE/USD'));
    assert.ok(!snapshot.market.some(asset => asset.symbol === 'TEST01'));

    const bot = await api('bot', { id: saved.id, version: saved.version, adopt: true, symbol: 'GLD' });
    const firstClose = await api('bot', { id: bot.id, delete: true, liquidate: true });
    assert.equal(firstClose.pending, true);
    assert.equal(firstClose.liquidated, false);
    assert.equal((await api('state')).bots[bot.id].closingOrder, firstClose.order.client);
    await until(async () => {
      const state = await api('state');
      return state.bots[bot.id]?.status === 'Liquidation incomplete. Position remains open.';
    });

    const retry = await api('bot', { id: bot.id, delete: true, liquidate: true });
    assert.equal(retry.pending, true);
    assert.equal(retry.order.qty, 1);
    await until(async () => {
      const state = await api('state');
      return !state.bots[bot.id] && !state.positions.some(position => position.symbol === 'GLD');
    });
  }, null, { FASTTRADER_MODE: 'alpaca', ALPACA_KEY: 'test-key', ALPACA_SECRET: 'test-secret' }, `
    const originalFetch = globalThis.fetch;
    const asset = (symbol, kind, details = {}) => ({ symbol, class: kind, name: symbol, tradable: true, ...details });
    const cryptoRules = { fractionable: true, min_trade_increment: '0.1', min_order_size: '1', price_increment: '0.000001' };
    let remaining = 2;
    const closes = [];
    globalThis.WebSocket = class {
      addEventListener() {}
      close() {}
    };
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      if (url.hostname === 'data.alpaca.markets') return Response.json({ bars: {} });
      if (url.hostname !== 'paper-api.alpaca.markets') return originalFetch(input, options);
      switch (url.pathname) {
        case '/v2/assets': {
          const kind = url.searchParams.get('asset_class');
          const assets = {
            us_equity: [
              asset('GLD', kind, { name: 'Gold Alternative ETF' }),
              ...Array.from({ length: 35 }, (_, index) => asset('TEST' + String(index).padStart(2, '0'), kind))
            ],
            crypto: [asset('DOGE/USD', kind, cryptoRules), asset('DOGE/USDT', kind, cryptoRules)],
            us_index: [asset('SPX', kind, { tradable: false })]
          };
          return Response.json(assets[kind] ?? []);
        }
        case '/v2/account': return Response.json({ status: 'ACTIVE', cash: '10000', equity: '10000', buying_power: '10000' });
        case '/v2/clock': return Response.json({ is_open: false });
        case '/v2/positions': return Response.json(remaining ? [{
          symbol: 'GLD', asset_class: 'us_equity', qty: String(remaining), avg_entry_price: '100',
          current_price: '100', market_value: String(remaining * 100)
        }] : []);
        case '/v2/orders': {
          if (options?.method === 'POST') {
            const order = JSON.parse(options.body);
            const accepted = { ...order, id: 'close-' + closes.length, asset_class: 'us_equity',
              submitted_at: new Date().toISOString(), status: 'accepted', filled_qty: '0' };
            closes.push(accepted);
            return Response.json(accepted);
          }
          return Response.json(closes.filter(order => url.searchParams.get('status') !== 'open' || order.status === 'accepted'));
        }
        case '/v2/orders:by_client_order_id': {
          const order = closes.find(item => item.client_order_id === url.searchParams.get('client_order_id'));
          if (!order) return Response.json({}, { status: 404 });
          remaining--;
          Object.assign(order, { status: remaining ? 'canceled' : 'filled', filled_qty: '1',
            filled_avg_price: '100', filled_at: new Date().toISOString() });
          return Response.json(order);
        }
        default: return Response.json([]);
      }
    };
  `);
});
