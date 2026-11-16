import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { instruments, defaults, strategy, decision, replay, synthetic, botLedger, isCrypto, cryptoReplayRules, roundDown } from './engine.mjs';
import { assessSignal, signalProvider } from './signal-ai.mjs';
import { createAuth, sameSecret } from './auth.mjs';

const mode = process.env.FASTTRADER_MODE || 'demo';
const aiProvider = signalProvider(process.env);
const demo = mode === 'demo';
const feed = process.env.ALPACA_FEED || 'iex';
const headers = { 'APCA-API-KEY-ID': process.env.ALPACA_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET };
if (!demo && (mode !== 'alpaca' || !headers['APCA-API-KEY-ID'] || !headers['APCA-API-SECRET-KEY'] || !['iex','sip','delayed_sip'].includes(feed))) {
  throw Error('Set valid Alpaca Paper credentials and a supported feed in .env.');
}
const host = process.env.FASTTRADER_HOST || '127.0.0.1';
const bridgeSecret = process.env.WORKER_SHARED_SECRET;
if ((bridgeSecret && bridgeSecret.length < 32) || (host !== '127.0.0.1' && !bridgeSecret)) {
  throw Error('A hosted worker requires a WORKER_SHARED_SECRET of at least 32 characters.');
}
const signupCode = process.env.FASTTRADER_SIGNUP_CODE;
if (signupCode && signupCode.length < 24) throw Error('FASTTRADER_SIGNUP_CODE must have at least 24 characters.');
const directory = process.env.FASTTRADER_DATA_DIR || '.fasttrader';
const file = directory + '/' + (demo ? 'demo' : 'alpaca-' + createHash('sha256').update(headers['APCA-API-KEY-ID']).digest('hex').slice(0, 16)) + '.json';
const terminal = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced']);
const time = () => new Date().toISOString();
let state = {
  cash: 100000, account: { equity: 100000, cash: 100000, buyingPower: 100000, dayStart: 100000, exposure: 0 },
  strategies: [{ ...defaults, id: 'default', version: 1 }], bots: {}, positions: [], orders: [], signals: [], runs: [],
  equity: [], profile: { name: 'Paper Trader', email: '', offlineSync: true }, alerts: {}, events: [], quotes: {}, bars: {},
  feed: 'connecting', broker: 'connecting', sessionOpen: demo, synced: null
};
await mkdir(directory, { recursive: true });
const auth = await createAuth({
  file: directory + '/auth.json', signupCode,
  required: Boolean(bridgeSecret || signupCode || process.env.FASTTRADER_AUTH === 'required'),
  secure: Boolean(bridgeSecret)
});
try { state = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const signal of state.signals.filter(item => !item.strategyId)) {
  const matches = state.strategies.filter(item => item.name === signal.strategy && item.symbol === signal.symbol && item.version === signal.version);
  if (matches.length === 1) signal.strategyId = matches[0].id;
}
state.feed = state.cryptoFeed = state.broker = 'connecting';
state.cryptoSessionOpen = false;
const symbols = Object.keys(instruments);
const feedKey = symbol => isCrypto(symbol) ? 'cryptoFeed' : 'feed';
const feedEpoch = { feed: 0, cryptoFeed: 0 };
let brokerAt = 0, busy = false, simulated = {}, latestDemo = Date.now() - 5000;
let lastSubmittingBot;
const eligible = new Set(demo ? symbols : []);
const cryptoRules = new Map(demo ? symbols.filter(isCrypto).map(symbol => [symbol, cryptoReplayRules]) : []);
const assetFetchedAt = { us_equity: 0, crypto: 0 };
const canonicalSymbol = symbol => symbols.find(candidate => isCrypto(candidate) && candidate.replace('/', '') === symbol) ?? symbol;
const sourceFor = symbol => demo ? 'Synthetic market' : isCrypto(symbol) ? 'Alpaca Crypto US' : 'Alpaca ' + feed.toUpperCase();
const validBar = bar => Number.isFinite(bar.c) && bar.c > 0 && Number.isFinite(bar.o) && bar.o > 0;
const maxAge = 150000;
const aiLimit = 3;
const aiLifetime = 12000;
const pendingAI = new Map();
let activeAI = 0;
let queue = Promise.resolve();
function serial(task) {
  const job = queue.then(task);
  queue = job.catch(() => {});
  return job;
}
async function persist() {
  await writeFile(file + '.tmp', JSON.stringify(state));
  await rename(file + '.tmp', file);
}
function event(kind, message) {
  if (!state.alerts[kind]) return;
  state.events.unshift({ t: time(), kind, message });
  state.events.length = Math.min(state.events.length, 50);
}
async function request(host, path, opts = {}) {
  const response = await fetch(host + path, { ...opts, headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw Object.assign(Error('Alpaca request failed (' + response.status + ')'), { status: response.status });
  return response.status === 204 ? null : response.json();
}
const broker = (path, opts) => request('https://paper-api.alpaca.markets/v2', path, opts);
async function history(symbol, start, end) {
  if (demo) return synthetic(symbol, start, end, 60000);
  const params = new URLSearchParams({ symbols: symbol, timeframe: '1Min', start: new Date(start).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
  const crypto = isCrypto(symbol);
  if (!crypto) params.set('feed', feed === 'delayed_sip' ? 'sip' : feed);
  const path = crypto ? '/v1beta3/crypto/us/bars?' : '/v2/stocks/bars?';
  const bars = [];
  do {
    const page = await request('https://data.alpaca.markets', path + params);
    bars.push(...(page.bars?.[symbol] ?? []).filter(validBar));
    if (!page.next_page_token) break;
    params.set('page_token', page.next_page_token);
  } while (true);
  return bars;
}
function addBar(symbol, bar) {
  if (!validBar(bar)) return;
  const list = state.bars[symbol] ??= [];
  if (list.at(-1)?.t >= bar.t) return;
  list.push({ t: bar.t, c: bar.c, o: bar.o, v: bar.v, vw: bar.vw });
  if (list.length > 1500) list.shift();
}
function connect(key, retry = 1000) {
  const crypto = key === 'cryptoFeed';
  const channel = crypto ? '/v1beta3/crypto/us' : '/v2/' + feed;
  const subscription = symbols.filter(symbol => feedKey(symbol) === key);
  const socket = new WebSocket('wss://stream.data.alpaca.markets' + channel);
  state[key] = 'connecting';
  const timeout = setTimeout(() => socket.close(), 10000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ action: 'auth', key: headers['APCA-API-KEY-ID'], secret: headers['APCA-API-SECRET-KEY'] })));
  socket.addEventListener('message', ({ data }) => {
    try {
      for (const msg of JSON.parse(data)) {
        if (msg.T === 'success' && msg.msg === 'authenticated') socket.send(JSON.stringify({ action: 'subscribe', bars: subscription, trades: subscription }));
        if (msg.T === 'subscription') {
          clearTimeout(timeout);
          retry = 1000;
          state[key] = !crypto && feed === 'delayed_sip' ? 'delayed' : 'live';
          feedEpoch[key] = Date.now();
        }
        if (msg.T === 'error') socket.close();
        if (!subscription.includes(msg.S)) continue;
        if (msg.T === 'b') addBar(msg.S, msg);
        if (msg.T === 't' && msg.p > 0 && (!state.quotes[msg.S] || msg.t > state.quotes[msg.S].t)) state.quotes[msg.S] = { price: msg.p, t: msg.t };
      }
    } catch { socket.close(); }
  });
  socket.addEventListener('error', () => socket.close());
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    state[key] = 'offline';
    event('connections', (crypto ? 'Crypto' : 'Stock') + ' market feed disconnected');
    setTimeout(() => connect(key, Math.min(30000, retry * 2)), retry);
  });
}

function normalize(order) {
  return { id: order.id, client: order.client_order_id, symbol: canonicalSymbol(order.symbol), side: order.side, qty: +order.qty,
    filled: +order.filled_qty, status: order.status, price: order.filled_avg_price ? +order.filled_avg_price : null,
    limitPrice: order.limit_price ? +order.limit_price : null, filledAt: order.filled_at || null, t: order.submitted_at || order.created_at };
}
function updateOrder(order) {
  const prior = state.orders.find(item => item.client === order.client);
  if (order.status === 'filled' && prior?.status !== 'filled') event('fills', order.symbol + ' ' + order.side + ' filled');
  if (prior) Object.assign(prior, order);
  else state.orders.unshift(order);
}
async function refreshAssets(assetClass) {
  if (Date.now() - assetFetchedAt[assetClass] < 60000) return;
  assetFetchedAt[assetClass] = Date.now();
  const crypto = assetClass === 'crypto';
  try {
    const assets = await broker('/assets?status=active&asset_class=' + assetClass);
    for (const symbol of symbols.filter(item => isCrypto(item) === crypto)) {
      eligible.delete(symbol);
      cryptoRules.delete(symbol);
    }
    for (const asset of assets) {
      const symbol = canonicalSymbol(asset.symbol);
      if (!Object.hasOwn(instruments, symbol) || isCrypto(symbol) !== crypto || !asset.tradable) continue;
      if (crypto) {
        const rules = { increment: +asset.min_trade_increment, minimum: +asset.min_order_size, tick: +asset.price_increment, minValue: 0 };
        if (!asset.fractionable || ![rules.increment,rules.minimum,rules.tick].every(value => Number.isFinite(value) && value > 0)) continue;
        cryptoRules.set(symbol, rules);
      }
      eligible.add(symbol);
    }
  } catch {
    event('connections', (crypto ? 'Crypto' : 'Stock') + ' eligibility could not be refreshed');
  }
}
async function reconcile() {
  if (demo) {
    if (simulated.broker) throw Error('Demo broker disconnected');
    let exposure = 0;
    for (const position of state.positions) {
      position.price = state.quotes[position.symbol]?.price ?? position.entry;
      exposure += position.qty * position.price;
    }
    const equity = state.cash + exposure;
    const day = time().slice(0, 10);
    state.account = { equity, cash: state.cash, buyingPower: state.cash, exposure, day, dayStart: state.account.day === day ? state.account.dayStart : state.account.equity };
  } else {
    const [account, positions, orders, openOrders, clock] = await Promise.all([
      broker('/account'), broker('/positions'), broker('/orders?status=all&limit=500'), broker('/orders?status=open&limit=500'),
      broker('/clock').catch(() => null), refreshAssets('us_equity'), refreshAssets('crypto')
    ]);
    if (openOrders.length >= 500) throw Error('Open order window exceeds reconciliation capacity');
    orders.forEach(order => updateOrder(normalize(order)));
    openOrders.forEach(order => updateOrder(normalize(order)));
    for (const item of state.orders.filter(order => order.owned && !terminal.has(order.status))) {
      try {
        updateOrder(normalize(await broker('/orders:by_client_order_id?client_order_id=' + encodeURIComponent(item.client))));
      } catch (error) {
        if (error.status !== 404 || item.status !== 'unknown') throw error;
        // Ambiguous submissions remain blocked pending broker confirmation.
      }
    }
    state.positions = positions.map(p => ({ symbol: canonicalSymbol(p.symbol), qty: +p.qty, entry: +p.avg_entry_price, price: +p.current_price }));
    state.account = { equity: +account.equity, cash: +account.cash, buyingPower: +account.buying_power, dayStart: +account.last_equity,
      cryptoBuyingPower: account.non_marginable_buying_power == null ? +account.cash : +account.non_marginable_buying_power,
      exposure: positions.reduce((sum, p) => sum + Math.abs(+p.market_value), 0) };
    const trading = !account.trading_blocked && !account.account_blocked && account.status === 'ACTIVE';
    state.sessionOpen = Boolean(clock?.is_open) && trading;
    state.cryptoSessionOpen = trading && (account.crypto_status == null || account.crypto_status === 'ACTIVE');
  }
  if (state.broker === 'offline') feedEpoch.feed = feedEpoch.cryptoFeed = Date.now();
  state.broker = demo ? 'simulated' : 'connected';
  brokerAt = Date.now();
}
function ready(symbol) {
  const bar = state.bars[symbol]?.at(-1);
  const key = feedKey(symbol);
  const open = demo || (isCrypto(symbol) ? state.cryptoSessionOpen : state.sessionOpen);
  return eligible.has(symbol) && (state[key] === 'live' || state[key] === 'simulated') && Date.now() - brokerAt < 20000 &&
    brokerAt >= feedEpoch[key] && open && bar && Date.now() - Date.parse(bar.t) < maxAge;
}
const unresolvedOrders = () => state.orders.some(order => !terminal.has(order.status));

function quotePrice(symbol, bar) {
  const quote = state.quotes[symbol];
  return quote && Date.now() - Date.parse(quote.t) < maxAge ? quote.price : bar.c;
}

const botOrders = id => state.orders.filter(order => order.owned && order.strategyId === id);
const hasBudget = budget => Number.isFinite(budget) && budget >= 1 && budget <= 1e9;
function reservedBuys(orders) {
  let reserved = 0;
  for (const order of orders) {
    if (order.side !== 'buy' || terminal.has(order.status) || order.qty <= order.filled) continue;
    if (!Number.isFinite(order.limitPrice) || order.limitPrice <= 0) return null;
    reserved += (order.qty - order.filled) * order.limitPrice;
  }
  return reserved;
}

function orderContext(bot, s, bars) {
  const position = state.positions.find(p => p.symbol === s.symbol);
  const ledger = botLedger(botOrders(bot.id), s.symbol, hasBudget(bot.budget) ? bot.budget : null);
  const { qty } = ledger;
  const rules = isCrypto(s.symbol) ? cryptoRules.get(s.symbol) : null;
  const tolerance = rules ? 0.00000001 : 0.000001;
  if (position ? position.qty <= 0 || Math.abs(position.qty - qty) > tolerance : Math.abs(qty) > tolerance) return null;
  const price = quotePrice(s.symbol, bars.at(-1));
  const cash = Math.min(state.account.cash, state.account.buyingPower, ledger.available,
    rules ? state.account.cryptoBuyingPower ?? state.account.cash : Infinity);
  const account = { ...state.account, cash };
  return { position, price, ledger, cash, rules, proposal: decision(s, bars.slice(-s.period).map(b => b.c), account, position, price, rules) };
}

function currentCandidate(candidate) {
  const { bot, s, bar, epoch, expires } = candidate;
  return state.bots[bot.id] === bot && bot.desired === 'running' && feedEpoch[feedKey(s.symbol)] === epoch &&
    Date.now() < expires && ready(s.symbol) && state.bars[s.symbol]?.at(-1)?.t === bar.t;
}

function drainAI() {
  for (const [id, job] of pendingAI) {
    if (activeAI >= aiLimit) break;
    if (job.started) continue;
    if (!currentCandidate(job)) {
      pendingAI.delete(id);
      continue;
    }
    job.started = true;
    activeAI++;
    void completeAI(job);
  }
}

async function completeAI(job) {
  const { bot, s, proposal, bars } = job;
  let model, error;
  try { model = await assessSignal(aiProvider, s.symbol, proposal.side, bars); }
  catch (failure) { error = failure; }
  activeAI--;
  drainAI();
  try {
    await serial(async () => {
      if (!currentCandidate(job)) return;
      if (error) {
        bot.status = error.message;
      } else {
        bot.status = 'Running';
        if (model.side === proposal.side && !unresolvedOrders()) {
          try { await reconcile(); }
          catch {
            state.broker = 'offline';
            brokerAt = 0;
            bot.status = 'Waiting for fresh feed and broker';
            event('connections', 'Broker reconciliation failed');
          }
        }
        if (!currentCandidate(job)) return;
        try { await applySignal(job, model); }
        catch (failure) {
          bot.status = failure.message;
          brokerAt = 0;
          state.broker = 'offline';
        }
      }
      await persist();
    });
  } catch (failure) {
    console.error('AI completion:', failure.message);
  } finally {
    pendingAI.delete(bot.id);
    drainAI();
  }
}

async function evaluate(bot) {
  const s = state.strategies.find(item => item.id === bot.id && item.version === bot.version);
  const bars = state.bars[s.symbol] ?? [];
  const bar = bars.at(-1);
  if (!ready(s.symbol)) {
    bot.status = !demo && !isCrypto(s.symbol) && state.broker === 'connected' && !state.sessionOpen
      ? 'Stock session closed or trading unavailable' : 'Waiting for fresh feed and broker';
    return;
  }
  if (unresolvedOrders()) { bot.status = 'Waiting for order reconciliation'; return; }
  const epoch = feedEpoch[feedKey(s.symbol)];
  if (Date.parse(bar.t) + (demo ? 0 : 60000) < Math.max(bot.started, epoch)) {
    bot.status = 'Waiting for a new bar';
    return;
  }
  if (bar.t === bot.lastBar) return;
  bot.lastBar = bar.t;
  const context = orderContext(bot, s, bars);
  if (!context) {
    bot.status = 'Position differs from strategy fills';
    bot.lastEvaluation = { t: bar.t, direction: 'hold', rationale: bot.status };
    return;
  }
  const minimum = context.rules ? Math.max(context.rules.minValue, context.price * context.rules.minimum) : context.price;
  bot.status = !hasBudget(bot.budget) ? 'Budget required for new buys' :
    !context.ledger.complete ? 'Awaiting complete fill history' :
    !context.position && context.ledger.available < minimum ? 'Budget below minimum order size' : 'Running';
  const { proposal } = context;
  if (!proposal) {
    const rationale = bot.status !== 'Running' ? bot.status :
      bars.length < s.period ? 'Waiting for enough bars to calculate the indicator' :
      state.account.equity <= state.account.dayStart * (1 - s.dailyLoss / 100) ? 'Daily loss limit reached' :
      context.cash < minimum && !context.position ? 'Available buying power is below the minimum order' :
      context.position ? 'Holding the current position. No exit rule matched.' : 'No entry passed the strategy and risk rules.';
    bot.lastEvaluation = { t: bar.t, price: context.price, direction: 'hold', rationale };
    return;
  }
  bot.lastEvaluation = { t: bar.t, price: context.price, direction: proposal.side, rationale: proposal.rationale };
  const candidate = { bot, s, bar, proposal, epoch, expires: Date.now() + aiLifetime };
  if (s.ai && !proposal.protective) {
    if (pendingAI.has(bot.id) || pendingAI.size >= symbols.length) {
      bot.status = 'Waiting for AI capacity';
      return;
    }
    pendingAI.set(bot.id, { ...candidate, bars: bars.slice(-20) });
    bot.status = 'Awaiting AI confirmation';
    drainAI();
    return;
  }
  await applySignal(candidate);
}

async function applySignal(candidate, model = null) {
  const { bot, s, bar, proposal } = candidate;
  const signal = { t: time(), symbol: s.symbol, direction: model?.side ?? proposal.side, rationale: model?.rationale ?? proposal.rationale,
    strategyId: s.id, strategy: s.name, version: s.version, source: model ? aiProvider.name : 'Strategy rules' };
  state.signals.unshift(signal);
  bot.lastEvaluation = { ...bot.lastEvaluation, t: bar.t, direction: signal.direction, rationale: signal.rationale };
  state.signals.length = Math.min(100, state.signals.length);
  event('signals', signal.symbol + ' ' + signal.direction + ' signal');
  if (proposal.protective) event('risk', proposal.rationale);
  if (model && model.side !== proposal.side) return;
  if (!currentCandidate(candidate) || unresolvedOrders()) return;
  const context = orderContext(bot, s, state.bars[s.symbol]);
  if (!context) return;
  const { position, price: latest, proposal: validated, rules } = context;
  if (!validated || validated.side !== proposal.side) return;
  const rawQty = Math.min(proposal.qty, validated.qty);
  const qty = rules && proposal.side === 'sell' ? roundDown(rawQty, rules.increment) : rawQty;
  const limitPrice = proposal.side === 'buy' ? roundDown(latest, rules?.tick ?? 0.01) : null;
  if (rules && (qty + 1e-10 < rules.minimum || qty * (limitPrice ?? latest) < rules.minValue)) {
    bot.status = 'Order below crypto minimum';
    return;
  }
  const client = 'ft-' + createHash('sha256').update([s.id, s.version, bar.t, proposal.side].join('/')).digest('hex').slice(0, 40);
  if (state.orders.some(order => order.client === client)) return;
  const order = { client, owned: true, strategyId: s.id, strategy: s.name, version: s.version, symbol: s.symbol, side: proposal.side,
    qty, filled: 0, status: 'unknown', t: time(), price: null,
    limitPrice: demo ? null : limitPrice };
  if (demo) {
    order.status = 'filled';
    order.filled = qty;
    order.price = latest;
    order.filledAt = time();
    state.cash += qty * latest * (proposal.side === 'buy' ? -1 : 1);
    if (proposal.side === 'buy') state.positions.push({ symbol: s.symbol, qty, entry: latest, price: latest, strategy: s.name });
    else {
      order.pnl = qty * (latest - position.entry);
      if (position.qty - qty > 1e-9) position.qty = Number((position.qty - qty).toFixed(9));
      else state.positions = state.positions.filter(p => p !== position);
    }
    updateOrder(order);
    await reconcile();
    return;
  }
  state.orders.unshift(order);
  await persist();
  if (!currentCandidate(candidate)) { order.status = 'canceled'; return; }
  try {
    const decimal = value => value.toFixed(9).replace(/\.?0+$/, '');
    const execution = proposal.side === 'buy' ? { type: 'limit', limit_price: rules ? decimal(order.limitPrice) : order.limitPrice.toFixed(2) } : { type: 'market' };
    const submitted = await broker('/orders', { method: 'POST', body: JSON.stringify({
      symbol: s.symbol, qty: rules ? decimal(qty) : qty, side: proposal.side, ...execution, time_in_force: rules ? 'ioc' : 'day', client_order_id: client
    }) });
    updateOrder(normalize(submitted));
  } catch (error) {
    if ([400, 403, 422].includes(error.status)) {
      try { updateOrder(normalize(await broker('/orders:by_client_order_id?client_order_id=' + client))); }
      catch (lookup) { if (lookup.status === 404) order.status = 'rejected'; else throw lookup; }
    } else throw error;
  }
}
if (demo) {
  feedEpoch.feed = feedEpoch.cryptoFeed = Date.now() - 10000;
  for (const symbol of symbols) {
    if (!state.bars[symbol]?.length) state.bars[symbol] = synthetic(symbol, Date.now() - 86400000, Date.now(), 60000);
  }
} else {
  connect('feed');
  connect('cryptoFeed');
  for (const symbol of symbols) {
    const end = Date.now() - (isCrypto(symbol) ? 1 : 16) * 60000;
    history(symbol, Date.now() - 3 * 86400000, end).then(bars => {
      const merged = new Map([...bars, ...(state.bars[symbol] ?? [])].map(bar => [bar.t, bar]));
      state.bars[symbol] = [...merged.values()].sort((a, b) => a.t.localeCompare(b.t)).slice(-1500);
    }).catch(() => {});
  }
}
async function cycle() {
  if (busy) return;
  busy = true;
  try {
    await serial(async () => {
      if (demo) {
        state.feed = state.cryptoFeed = simulated.feed ? 'offline' : 'simulated';
        if (!simulated.feed) {
          const stamp = time();
          latestDemo += 5000;
          for (const symbol of symbols) {
            const [bar] = synthetic(symbol, latestDemo - latestDemo % 5000, latestDemo, 5000);
            addBar(symbol, { ...bar, t: stamp });
            state.quotes[symbol] = { price: bar.c, t: stamp };
          }
        }
      }
      try { await reconcile(); }
      catch {
        if (state.broker !== 'offline') event('connections', 'Broker reconciliation failed');
        state.broker = 'offline';
        brokerAt = 0;
      }
      const bots = Object.values(state.bots).filter(bot => bot.desired === 'running');
      const offset = bots.findIndex(bot => bot.id === lastSubmittingBot) + 1;
      for (const bot of [...bots.slice(offset), ...bots.slice(0, offset)]) {
        const count = state.orders.length;
        try { await evaluate(bot); }
        catch (error) {
          bot.status = error.message;
          if (!error.message.includes('AI')) { brokerAt = 0; state.broker = 'offline'; }
        }
        if (state.orders.length !== count) {
          lastSubmittingBot = bot.id;
          break;
        }
      }
      state.synced = time();
      if (brokerAt && (!state.equity.length || Date.now() - Date.parse(state.equity.at(-1).t) > 60000 || state.equity.at(-1).value !== state.account.equity)) {
        state.equity.push({ t: state.synced, value: state.account.equity });
        if (state.equity.length > 4500) state.equity.shift();
      }
      await persist();
    });
  } catch (error) { console.error('Engine cycle:', error.message); }
  finally { busy = false; }
}
await cycle();
setInterval(cycle, 5000);

const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/sw.js': ['sw.js','text/javascript'], '/mark.svg': ['mark.svg','image/svg+xml'] };
function snapshot() {
  const market = symbols.map(symbol => {
    const [name] = instruments[symbol];
    const crypto = isCrypto(symbol);
    const status = state[feedKey(symbol)];
    const bars = state.bars[symbol] ?? [];
    const first = bars.at(-60)?.c;
    const trade = state.quotes[symbol], last = bars.at(-1);
    const quote = trade && (!last || trade.t >= last.t) ? trade : { price: last?.c, t: last?.t };
    const window = bars.slice(-60);
    return { symbol, name, assetClass: crypto ? 'crypto' : 'stock', source: sourceFor(symbol),
      eligible: eligible.has(symbol) && (demo || !crypto || state.cryptoSessionOpen), ...quote, metricsAt: window.at(-1)?.t,
      change: first && quote.price ? 100 * (quote.price / first - 1) : null,
      volume: window.length ? window.reduce((sum, bar) => sum + (bar.v ?? 0) * (crypto ? bar.vw ?? bar.c : 1), 0) : null,
      volatility: first ? 100 * (Math.max(...window.map(bar => bar.c)) - Math.min(...window.map(bar => bar.c))) / first : null,
      freshness: Date.now() - Date.parse(quote.t) < maxAge && ['live','simulated','delayed'].includes(status) ? status : status === 'delayed' ? 'delayed' : 'cached' };
  });
  const botSessions = Object.fromEntries(Object.values(state.bots).map(bot => {
    const orders = botOrders(bot.id);
    const ledger = botLedger(orders, bot.symbol, bot.budget);
    const reserved = reservedBuys(orders);
    const position = state.positions.find(item => item.symbol === bot.symbol);
    const mark = position?.price ?? market.find(item => item.symbol === bot.symbol)?.price ?? null;
    const unrealized = ledger.complete && ledger.qty > 0 ? Number.isFinite(mark) ? ledger.qty * mark - ledger.cost : null : ledger.complete ? 0 : null;
    return [bot.id, { ...ledger, available: reserved === null ? 0 : Math.max(0, ledger.available - reserved), reserved, mark, unrealized }];
  }));
  return { ...state, botSessions, orders: state.orders.toSorted((a, b) => (b.t ?? '').localeCompare(a.t ?? '')),
    runs: state.runs.map(({ curve, trades, ...run }) => ({
    ...run, curve: curve.filter((_, idx) => idx % Math.ceil(curve.length / 650) === 0 || idx === curve.length - 1),
    tradeCount: trades.length, trades: trades.slice(-250)
  })),
    mode, market, aiConfigured: Boolean(aiProvider), aiProvider: aiProvider?.name ?? null,
    feedName: demo ? 'Synthetic market' : 'Alpaca ' + feed.toUpperCase() };
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
async function change(path, input) {
  if (path === '/api/strategy') {
    const mutation = typeof input.mutation === 'string' && /^[a-f0-9-]{36}$/.test(input.mutation) ? input.mutation : null;
    const recorded = mutation && state.strategies.find(item => item.mutation === mutation);
    if (recorded) return recorded;
    const existing = state.strategies.find(item => item.id === input.id);
    const id = existing?.id ?? randomUUID();
    const latest = state.strategies.findLast(item => item.id === id);
    if (latest && latest.version !== input.baseVersion) throw Error('Strategy changed. Review the latest version before saving.');
    const item = { ...strategy(input), id, version: (latest?.version ?? 0) + 1, mutation };
    state.strategies.push(item);
    return item;
  }
  if (path === '/api/bot') {
    const s = state.strategies.find(item => item.id === input.id && item.version === input.version);
    if (!s || !['running','paused','stopped'].includes(input.action)) throw Error('Invalid bot command.');
    if (input.symbol !== undefined && input.symbol !== s.symbol) throw Error('The instrument does not match this strategy version.');
    const previous = state.bots[s.id];
    if (input.create === true && previous) throw Error('This strategy already has a bot. Use its controls to resume it.');
    if (input.action !== 'running' && previous?.version !== s.version) throw Error('This bot version changed. Refresh and try again.');
    const budget = input.action === 'running' && input.budget !== undefined ? input.budget : previous?.budget;
    if (input.action === 'running') {
      if (!hasBudget(budget) || Math.abs(budget * 100 - Math.round(budget * 100)) > 0.0001) throw Error('Set a bot budget of at least $1, in dollars and cents, before starting.');
      if (previous?.desired === 'running' && hasBudget(previous.budget) && budget !== previous.budget) throw Error('Pause or stop this bot before changing its budget.');
      if (budget !== previous?.budget) {
        const orders = botOrders(s.id);
        const ledger = botLedger(orders, s.symbol, budget);
        const reserved = reservedBuys(orders);
        const committed = ledger.invested + (reserved ?? 0);
        if (reserved === null) throw Error('Wait for the pending buy to reconcile before changing the budget.');
        if (committed > 0 && committed - Math.min(0, ledger.realized) - budget > 0.000001) {
          throw Error('Choose a budget that covers open shares, pending buys, and prior realized losses.');
        }
      }
      if (!eligible.has(s.symbol)) throw Error('This instrument is awaiting Alpaca eligibility confirmation.');
      if (!demo && isCrypto(s.symbol) && !state.cryptoSessionOpen) throw Error('Crypto trading is unavailable on this Alpaca Paper account.');
      if (s.ai && !aiProvider) throw Error('Configure a Gemini or OpenAI API key before starting this bot.');
      const active = Object.values(state.bots).find(bot => bot.id !== s.id && bot.desired === 'running' && bot.symbol === s.symbol);
      if (active) throw Error('Pause or stop the existing ' + s.symbol + ' bot before starting another for that instrument.');
      if (previous && previous.symbol !== s.symbol) {
        const orders = state.orders.filter(order => order.strategyId === s.id && order.symbol === previous.symbol);
        const net = orders.reduce((qty, order) => qty + (order.side === 'buy' ? order.filled : -order.filled), 0);
        if (Math.abs(net) > (isCrypto(previous.symbol) ? 0.0000000005 : 0.000001) || orders.some(order => !terminal.has(order.status))) {
          throw Error('Resolve the bot’s existing position and open orders before switching instruments.');
        }
      }
    }
    if (previous?.version === s.version && previous.desired === input.action && previous.budget === budget) return previous;
    state.bots[s.id] = { id: s.id, version: s.version, name: s.name, symbol: s.symbol, desired: input.action, status: input.action,
      budget, createdAt: previous?.createdAt ?? previous?.started ?? Date.now(), started: Date.now(),
      lastBar: previous?.symbol === s.symbol ? previous.lastBar : undefined,
      lastEvaluation: previous?.version === s.version && previous?.symbol === s.symbol ? previous.lastEvaluation : undefined };
    return state.bots[s.id];
  }
  if (path === '/api/settings') {
    state.alerts = Object.fromEntries(['signals','fills','risk','connections'].map(key => [key, input[key] === true]));
    return state.alerts;
  }
  if (path === '/api/profile') {
    state.profile = { name: String(input.name || 'Paper Trader').slice(0, 80), email: String(input.email || '').slice(0, 120), offlineSync: input.offlineSync === true };
    return state.profile;
  }
  if (path === '/api/demo' && demo) {
    simulated = { feed: input.feed === true, broker: input.broker === true };
    state.feed = state.cryptoFeed = simulated.feed ? 'offline' : 'connecting';
    state.broker = 'connecting';
    brokerAt = 0;
    feedEpoch.feed = feedEpoch.cryptoFeed = Date.now();
    event('connections', 'Demo connectivity changed');
    return simulated;
  }
  throw Error('Unknown operation');
}
async function backtest(input) {
  const s = state.strategies.find(item => item.id === input.id && item.version === input.version);
  if (!s || s.ai) throw Error('Select a saved strategy with deterministic inputs for historical replay.');
  const { capital, fees, slippage } = input;
  const start = Date.parse(input.start), end = Math.min(Date.parse(input.end) + 86400000 - 1, Date.now() - 60000);
  if (![capital, fees, slippage, start, end].every(Number.isFinite) || capital < 100 || capital > 1e9 ||
    Math.min(fees, slippage) < 0 || Math.max(fees, slippage) > 500 || end <= start || end - start > 31 * 86400000) throw Error('Use a valid date range up to 31 days and valid execution costs.');
  const bars = await history(s.symbol, start, end);
  if (bars.length <= s.period) throw Error('Insufficient historical bars for this strategy.');
  const result = replay(s, bars, { capital, fees, slippage });
  return serial(async () => {
    const run = { ...result, id: randomUUID(), t: time(), name: s.name, version: s.version, symbol: s.symbol, capital, fees, slippage, start: input.start, end: input.end, source: sourceFor(s.symbol) };
    state.runs.unshift(run);
    state.runs.length = Math.min(12, state.runs.length);
    await persist();
    return { id: run.id };
  });
}
const server = createServer(async (req, res) => {
  const respond = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    const port = server.address().port;
    if (bridgeSecret) {
      if (!sameSecret(req.headers['x-fasttrader-worker-secret'], bridgeSecret)) return respond(403, { error: 'Worker authorization required.' });
    } else if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) {
      return respond(403, { error: 'Use the loopback workspace address.' });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/') &&
      (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '') ||
       (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) {
      return respond(403, { error: 'Use a same-origin JSON request.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth') return respond(200, auth.status(req.headers.cookie));
    if (req.method === 'POST' && url.pathname === '/api/auth') {
      const result = await auth.change(await body(req), req.headers.cookie);
      return respond(200, result.data, { 'Set-Cookie': result.cookie });
    }
    if (url.pathname.startsWith('/api/') && !auth.authenticated(req.headers.cookie)) return respond(401, { error: 'Sign in to FastTrader.' });
    if (req.method === 'GET' && url.pathname === '/api/state') return respond(200, snapshot());
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const input = await body(req);
      const result = url.pathname === '/api/backtest' ? await backtest(input) : await serial(async () => {
        if (!auth.authenticated(req.headers.cookie)) throw Object.assign(Error('Sign in to FastTrader.'), { status: 401 });
        const value = await change(url.pathname, input);
        await persist();
        return value;
      });
      return respond(200, result);
    }
    const asset = assets[url.pathname];
    if (req.method !== 'GET' || !asset) return respond(404, { error: 'Not found' });
    const contents = await readFile(new URL('./public/' + asset[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(contents);
  } catch (error) { respond(error.status >= 400 && error.status < 600 ? error.status : 400, { error: error instanceof SyntaxError ? 'Invalid JSON' : error.message }); }
});
server.listen(Number(process.env.PORT || 3000), host, () => console.log('FastTrader ' + mode + ' running at http://' + host + ':' + server.address().port));
