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
import { defaults, decision, replay } from './engine.mjs';
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
    await api('bot',{id:version.id,version:version.version,action:'running'});
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
    assert.equal(new Set(snapshot.orders.map(o=>o.client)).size,snapshot.orders.length);
    await api('bot',{id:version.id,version:version.version,action:'stopped'});
    assert.equal((await api('state')).bots.default.desired,'stopped');

    await api('demo',{feed:true});
    const qqq = await api('strategy',{...defaults,name:'QQQ Momentum',symbol:'QQQ'});
    const spy = await api('strategy',{...defaults,name:'Second SPY'});
    await api('bot',{id:version.id,version:version.version,action:'running'});
    const launch = {id:qqq.id,version:qqq.version,action:'running',create:true};
    await api('bot',launch);
    await assert.rejects(api('bot',launch), /already has a bot/);
    await assert.rejects(api('bot',{id:spy.id,version:spy.version,action:'running',create:true}), /existing SPY bot/);
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
      for (const bot of bots) await api('bot', { id: bot.id, version: bot.version, action: 'running' });
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
    assert.equal((await send('bot', { id:'default', version:1, action:'running' })).status, 401);
    assert.equal((await send('bot', { id:'default', version:1, action:'running' }, cookie)).status, 200);
    const snapshot = await send('state', null, cookie);
    assert.equal(snapshot.headers.get('cache-control'), 'no-store');
    assert.equal((await snapshot.json()).bots.default.desired, 'running');
    assert.equal((await send('auth', { action:'logout' }, cookie)).status, 200);
    assert.equal((await send('state', null, cookie)).status, 401);
    assert.equal((await send('auth', { ...owner, action:'login', password:'wrong' })).status, 401);
    assert.equal((await send('auth', { ...owner, action:'login' })).status, 200);
  }, null, { FASTTRADER_SIGNUP_CODE: setup, WORKER_SHARED_SECRET: shared });
});
