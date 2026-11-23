import { replayPortfolio, createPaperPortfolio, stepPaperPortfolio, paperPortfolioSummary } from './portfolio.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { instruments, defaults, strategy, decision, replay, downsampleCurve, synthetic, botLedger, isCrypto, cryptoReplayRules, roundDown, strategyWindow, entrySignal, evaluateRuleSet, aggregateBars, closedStrategyBars, computeATR, computeRSI, indicatorValue, timeframes, ruleWarmupBars, shouldWakeAutonomousAI } from './engine.mjs';
import { assessSignal, signalProvider, testProviderKey, defaultGeminiModel } from './signal-ai.mjs';
import { createAuth, sameSecret } from './auth.mjs';
import { createStore } from './store.mjs';
import { createTelegram } from './telegram.mjs';

const mode = process.env.FASTTRADER_MODE || 'demo';
const aiProvider = signalProvider(process.env);
const demo = mode === 'demo';
const feed = process.env.ALPACA_FEED || 'iex';
const headers = { 'APCA-API-KEY-ID': process.env.ALPACA_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET };
if (!demo && (mode !== 'alpaca' || !headers['APCA-API-KEY-ID'] || !headers['APCA-API-SECRET-KEY'] || !['iex', 'sip', 'delayed_sip'].includes(feed))) {
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
const storeKey = demo ? 'demo' : 'alpaca-' + createHash('sha256').update(headers['APCA-API-KEY-ID']).digest('hex').slice(0, 16);
const file = directory + '/' + storeKey + '.json';
const remoteStore = createStore(process.env);
const telegram = createTelegram(process.env);
const secretsFile = directory + '/secrets-' + storeKey + '.json';
const secretKey = createHash('sha256').update(process.env.WORKER_SHARED_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ALPACA_SECRET || 'fasttrader-local-bot-ai-key').digest();
function encryptSecret(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decryptSecret(enc) {
  if (!enc?.iv || !enc?.tag || !enc?.data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    const raw = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(raw);
  } catch { return null; }
}
const validProvider = p => {
  if (!p?.key || !['Gemini', 'OpenAI'].includes(p?.name)) return null;
  if (p.name === 'Gemini' && (!p.model || p.model.replace(/^models\//, '') === 'gemini-2.5-flash')) {
    return { ...p, model: defaultGeminiModel };
  }
  return p;
};
const maskKey = k => (typeof k === 'string' && k.length > 8 ? k.slice(0, 4) + '…' + k.slice(-4) : '••••');
let botAiProvider = null;
const perBotAiProviders = new Map();
async function loadBotAiProvider() {
  let raw = remoteStore.enabled ? await remoteStore.load('secrets:' + storeKey) : null;
  if (!raw) {
    try { raw = JSON.parse(await readFile(secretsFile, 'utf8')); }
    catch (err) { if (err.code !== 'ENOENT') console.error('Load bot AI key:', err.message); }
  }
  const parsed = decryptSecret(raw);
  if (!parsed) return;
  if (validProvider(parsed)) {
    botAiProvider = parsed;
  } else {
    botAiProvider = validProvider(parsed.defaultKey);
    if (parsed.bots && typeof parsed.bots === 'object') {
      for (const [id, entry] of Object.entries(parsed.bots)) {
        const clean = validProvider(entry);
        if (clean) perBotAiProviders.set(id, clean);
      }
    }
  }
}
async function saveAiSecrets() {
  const hasAny = Boolean(botAiProvider) || perBotAiProviders.size > 0;
  const payload = hasAny ? encryptSecret({ defaultKey: botAiProvider, bots: Object.fromEntries(perBotAiProviders) }) : { cleared: true };
  await writeFile(secretsFile + '.tmp', JSON.stringify(payload));
  await rename(secretsFile + '.tmp', secretsFile);
  if (remoteStore.enabled) await remoteStore.save('secrets:' + storeKey, payload, { force: true });
}
async function saveBotAiProvider(provider) {
  botAiProvider = provider;
  await saveAiSecrets();
}
const providerFor = (s, botId = s?.id) => (botId && perBotAiProviders.get(botId)) || (s?.mode === 'ai_autonomous' && botAiProvider) || aiProvider;
const keySourceFor = (s, botId = s?.id) =>
  (botId && perBotAiProviders.has(botId)) ? 'Personal Bot Key' :
    (s?.mode === 'ai_autonomous' && botAiProvider) ? 'Dedicated Bot Key' : 'Main .env Key';
function describeAiError(error, provider, keySource) {
  const status = error?.status;
  const prov = provider ? `${provider.name} · ${provider.model}` : 'AI provider';
  let hint;
  if (status === 429 || error?.message?.includes('(429)')) {
    hint = `Rate limit / quota hit on ${keySource} (${prov}). Backing off 5m (hard stops stay active). Tip: add a Personal Bot API Key or use 15Min/1Hour timeframe.`;
  } else if (status === 401 || status === 403) {
    hint = `API key rejected (${status}) on ${keySource} (${prov}). Check or replace the key in Settings or Bot Session → Advanced.`;
  } else if (status === 404) {
    hint = `Model not found (${prov}) on ${keySource}. Update the model name in Settings or .env.`;
  } else if (status === 0 || error?.message?.includes('timeout')) {
    hint = `Connection timeout to ${prov} (${keySource}). Will retry automatically on the next candle.`;
  } else if (status >= 500) {
    hint = `Temporary ${provider?.name ?? 'AI'} server error (${status}). Will retry automatically on the next candle.`;
  } else {
    hint = `${error?.message || 'AI error'} on ${keySource} (${prov}).`;
  }
  return error?.detail ? `${hint} Provider said: "${error.detail}"` : hint;
}
const terminal = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day']);
const time = () => new Date().toISOString();
let state = {
  cash: 100000, account: { equity: 100000, cash: 100000, buyingPower: 100000, dayStart: 100000, exposure: 0 },
  strategies: [{ ...defaults, id: 'default', version: 1 }], bots: {}, positions: [], orders: [], signals: [], runs: [],
  equity: [], profile: { name: 'Paper Trader', username: '', email: '', bio: '', avatar: '', timezone: 'UTC', riskTier: 'moderate', tradingStyle: 'swing', offlineSync: true }, alerts: {}, events: [], logs: [], quotes: {}, bars: {},
  feed: 'connecting', broker: 'connecting', sessionOpen: demo, synced: null
};
await mkdir(directory, { recursive: true });
await loadBotAiProvider();
const auth = await createAuth({
  file: directory + '/auth.json', signupCode,
  ownerEmail: process.env.FASTTRADER_OWNER_EMAIL,
  ownerPassword: process.env.FASTTRADER_OWNER_PASSWORD,
  remoteStore, storeKey: 'auth',
  required: Boolean(bridgeSecret || signupCode || process.env.FASTTRADER_AUTH === 'required'),
  secure: Boolean(bridgeSecret)
});
const remoteState = remoteStore.enabled ? await remoteStore.load('state:' + storeKey) : null;
if (remoteState && typeof remoteState === 'object') {
  state = { ...state, ...remoteState, bars: remoteState.bars ?? {} };
} else {
  try { state = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const remoteProfile = remoteStore.enabled ? await remoteStore.loadProfile(storeKey) : null;
if (remoteProfile) state.profile = { ...state.profile, ...remoteProfile };
else if (remoteStore.enabled) await remoteStore.saveProfile(storeKey, state.profile);
for (const signal of state.signals.filter(item => !item.strategyId)) {
  const matches = state.strategies.filter(item => item.name === signal.strategy && item.symbol === signal.symbol && item.version === signal.version);
  if (matches.length === 1) signal.strategyId = matches[0].id;
}
state.logs = Array.isArray(state.logs) ? state.logs.slice(0, 300) : [];
state.feed = state.cryptoFeed = state.broker = 'connecting';
state.cryptoSessionOpen = false;
const symbols = Object.keys(instruments);
const feedKey = symbol => isCrypto(symbol) ? 'cryptoFeed' : 'feed';
const feedEpoch = { feed: 0, cryptoFeed: 0 };
const polledAt = { feed: 0, cryptoFeed: 0 };
const wsConnected = { feed: false, cryptoFeed: false };
let brokerAt = 0, busy = false, simulated = {}, latestDemo = Date.now() - 5000;
let lastSubmittingBot;
const eligible = new Set(demo ? symbols : []);
const cryptoRules = new Map(demo ? symbols.filter(isCrypto).map(symbol => [symbol, cryptoReplayRules]) : []);
const catalogClasses = ['us_equity', 'crypto', 'us_option', 'crypto_perp', 'treasury', 'corporate', 'global_equity', 'us_index', 'us_equity_chain', 'ipo'];
const catalog = new Map();
const assetFetchedAt = {};
const assetFailures = new Set();
const trackedSymbols = () => [...new Set([...symbols, ...(state.paperPortfolio?.running ? [state.paperPortfolio.symbol] : []), ...Object.values(state.bots).filter(bot => bot.desired === 'running').map(bot => bot.symbol)])];
const supportsSymbol = symbol => Object.hasOwn(instruments, symbol) || (!demo && eligible.has(symbol));
const validateStrategy = input => strategy(input, supportsSymbol);
const assetEligible = symbol => eligible.has(symbol) && (demo || !isCrypto(symbol) || state.cryptoSessionOpen);
const canonicalSymbol = (symbol, assetClass) => {
  if (/^[A-Z0-9]+USD$/.test(symbol)) {
    const pair = symbol.slice(0, -3) + '/USD';
    if (assetClass === 'crypto' || (!assetClass && (symbols.includes(pair) || cryptoRules.has(pair)))) return pair;
  }
  return symbol;
};
const sourceFor = symbol => demo ? 'Synthetic market' : isCrypto(symbol) ? 'Alpaca Crypto US' : 'Alpaca ' + feed.toUpperCase();
const validBar = bar => Number.isFinite(bar.c) && bar.c > 0 && Number.isFinite(bar.o) && bar.o > 0;
const maxAge = 150000;
const aiLimit = 3;
const aiLifetime = 20000;
const staleOrderMs = 120000;
const cryptoSlippageBps = Math.max(0, Math.min(200, Number(process.env.ALPACA_CRYPTO_SLIPPAGE_BPS ?? 25) || 0));
const pendingAI = new Map();
const newsCache = new Map();
let activeAI = 0;
let queue = Promise.resolve();
function serial(task) {
  const job = queue.then(task);
  queue = job.catch(() => { });
  return job;
}
async function persist(force = true) {
  await writeFile(file + '.tmp', JSON.stringify(state));
  await rename(file + '.tmp', file);
  if (remoteStore.enabled) {
    const { bars, quotes, synced, feed: _f, cryptoFeed: _cf, broker: _b, ...durable } = state;
    const sync = Promise.all([
      remoteStore.save('state:' + storeKey, durable, { force }),
      remoteStore.saveProfile(storeKey, state.profile),
      remoteStore.syncTrades(storeKey, state.orders)
    ]);
    if (force) await sync;
    else void sync;
  }
}
function logEntry(category, level, message, meta = {}) {
  state.logs ??= [];
  state.logs.unshift({
    t: time(),
    category,
    level,
    message: String(message ?? '').slice(0, 220),
    ...(meta.botId ? { botId: meta.botId } : {}),
    ...(meta.bot ? { bot: String(meta.bot).slice(0, 60) } : {}),
    ...(meta.symbol ? { symbol: meta.symbol } : {}),
    ...(meta.detail ? { detail: String(meta.detail).slice(0, 320) } : {})
  });
  if (state.logs.length > 300) state.logs.length = 300;
}
function event(kind, message, details = [], meta = {}) {
  const catMap = { fills: 'trade', signals: 'signal', risk: 'risk', connections: 'system' };
  const lvl = kind === 'connections' ? 'warn' : kind === 'risk' ? 'warn' : kind === 'fills' ? 'good' : 'info';
  const detailText = Array.isArray(details) ? details.filter(Boolean).join(' · ') : '';
  logEntry(catMap[kind] ?? 'system', lvl, message, { ...meta, detail: meta.detail ?? detailText });
  if (!state.alerts[kind]) return;
  state.events.unshift({ t: time(), kind, message });
  state.events.length = Math.min(state.events.length, 50);
  if (telegram.configured && state.alerts.telegram !== false) {
    void telegram.notify(kind, message, details);
  }
}
async function request(host, path, opts = {}) {
  const response = await fetch(host + path, { ...opts, headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      if (typeof payload?.message === 'string' && payload.message.trim()) detail = ': ' + payload.message.trim();
    } catch { }
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    throw Object.assign(Error('Alpaca request failed (' + response.status + ')' + detail), {
      status: response.status,
      resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null
    });
  }
  return response.status === 204 ? null : response.json();
}
const broker = (path, opts) => request('https://paper-api.alpaca.markets/v2', path, opts);
async function history(symbol, start, end, timeframe = '1Min') {
  const tf = Object.hasOwn(timeframes, timeframe) ? timeframe : '1Min';
  if (demo) return synthetic(symbol, start, end, timeframes[tf]);
  const params = new URLSearchParams({ symbols: symbol, timeframe: tf, start: new Date(start).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
  const crypto = isCrypto(symbol);
  if (!crypto) {
    params.set('feed', feed === 'delayed_sip' ? 'sip' : feed);
    params.set('adjustment', 'split');
  }
  const path = crypto ? '/v1beta3/crypto/us/bars?' : '/v2/stocks/bars?';
  const bars = [];
  for (let pages = 0; pages < 50; pages++) {
    let page;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        page = await request('https://data.alpaca.markets', path + params);
        break;
      } catch (error) {
        if (error.status !== 429 || attempt === 2) throw error;
        const wait = error.resetAt ? Math.min(5000, Math.max(500, error.resetAt - Date.now())) : 1000 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
    bars.push(...(page.bars?.[symbol] ?? []).filter(validBar));
    if (!page.next_page_token) break;
    params.set('page_token', page.next_page_token);
  }
  return bars;
}
function addBar(symbol, bar) {
  if (!validBar(bar)) return;
  const list = state.bars[symbol] ??= [];
  if (list.at(-1)?.t >= bar.t) return;
  list.push({ t: bar.t, c: bar.c, o: bar.o, ...(Number.isFinite(bar.h) ? { h: bar.h } : {}), ...(Number.isFinite(bar.l) ? { l: bar.l } : {}), v: bar.v, vw: bar.vw });
  if (list.length > 1500) list.shift();
}
function connect(key, retry = 1000) {
  const crypto = key === 'cryptoFeed';
  const channel = crypto ? '/v1beta3/crypto/us' : '/v2/' + feed;
  const subscription = symbols.filter(symbol => feedKey(symbol) === key);
  const socket = new WebSocket('wss://stream.data.alpaca.markets' + channel);
  if (state[key] !== 'polling') state[key] = 'connecting';
  let nextRetry = Math.min(30000, retry * 2);
  const timeout = setTimeout(() => socket.close(), 10000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ action: 'auth', key: headers['APCA-API-KEY-ID'], secret: headers['APCA-API-SECRET-KEY'] })));
  socket.addEventListener('message', ({ data }) => {
    try {
      for (const msg of JSON.parse(data)) {
        if (msg.T === 'success' && msg.msg === 'authenticated') socket.send(JSON.stringify({ action: 'subscribe', bars: subscription, trades: subscription }));
        if (msg.T === 'subscription') {
          clearTimeout(timeout);
          nextRetry = 1000;
          wsConnected[key] = true;
          state[key] = !crypto && feed === 'delayed_sip' ? 'delayed' : 'live';
          feedEpoch[key] = Date.now();
        }
        if (msg.T === 'error') {
          if (msg.code === 406) nextRetry = 300000;
          if (state[key] !== 'polling') {
            console.error((crypto ? 'Crypto' : 'Stock') + ' feed error:', msg.code, msg.msg, msg.code === 406 ? '(using REST polling fallback)' : '');
            event('connections', (crypto ? 'Crypto' : 'Stock') + ' feed error (' + msg.code + '): ' + msg.msg);
          }
          socket.close();
        }
        if (!subscription.includes(msg.S)) continue;
        if (msg.T === 'b') addBar(msg.S, msg);
        if (msg.T === 't' && msg.p > 0 && (!state.quotes[msg.S] || msg.t > state.quotes[msg.S].t)) state.quotes[msg.S] = { price: msg.p, t: msg.t };
      }
    } catch { socket.close(); }
  });
  socket.addEventListener('error', () => socket.close());
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    wsConnected[key] = false;
    if (state[key] !== 'polling') {
      state[key] = 'offline';
      event('connections', (crypto ? 'Crypto' : 'Stock') + ' market feed disconnected');
    }
    setTimeout(() => connect(key, nextRetry), nextRetry);
  });
}

async function pollMarket(key) {
  if (demo || Date.now() - polledAt[key] < 15000) return;
  polledAt[key] = Date.now();
  const list = trackedSymbols().filter(symbol => feedKey(symbol) === key &&
    (!wsConnected[key] || !symbols.includes(symbol)));
  for (let offset = 0; offset < list.length; offset += 50) {
    await pollSymbols(key, list.slice(offset, offset + 50));
  }
}

async function pollSymbols(key, list) {
  const crypto = key === 'cryptoFeed';
  const params = new URLSearchParams({ symbols: list.join(',') });
  if (!crypto) params.set('feed', feed === 'delayed_sip' ? 'sip' : feed);
  const barPath = crypto ? '/v1beta3/crypto/us/latest/bars?' : '/v2/stocks/bars/latest?';
  const tradePath = crypto ? '/v1beta3/crypto/us/latest/trades?' : '/v2/stocks/trades/latest?';
  try {
    const [barRes, tradeRes] = await Promise.all([
      request('https://data.alpaca.markets', barPath + params),
      request('https://data.alpaca.markets', tradePath + params)
    ]);
    for (const symbol of list) {
      const bar = barRes.bars?.[symbol];
      if (bar) addBar(symbol, bar);
      const trade = tradeRes.trades?.[symbol];
      if (trade && trade.p > 0 && (!state.quotes[symbol] || trade.t > state.quotes[symbol].t)) {
        state.quotes[symbol] = { price: trade.p, t: trade.t };
      }
    }
    if (!wsConnected[key]) {
      const prior = state[key];
      state[key] = !crypto && feed === 'delayed_sip' ? 'delayed' : 'polling';
      if (prior !== state[key]) feedEpoch[key] = Date.now();
    }
  } catch { }
}

function normalize(order) {
  return {
    id: order.id, client: order.client_order_id, symbol: canonicalSymbol(order.symbol, order.asset_class), side: order.side, qty: +order.qty,
    filled: +order.filled_qty, status: order.status, price: order.filled_avg_price ? +order.filled_avg_price : null,
    limitPrice: order.limit_price ? +order.limit_price : null, filledAt: order.filled_at || null, t: order.submitted_at || order.created_at
  };
}
function updateOrder(order) {
  const prior = state.orders.find(item => item.client === order.client);
  if (order.status === 'filled' && prior?.status !== 'filled') {
    const botName = order.strategy ?? prior?.strategy;
    const val = Number.isFinite(order.price) && order.filled > 0 ? `$${(order.filled * order.price).toFixed(2)}` : '';
    const details = [
      botName ? `Bot: ${botName}` : null,
      Number.isFinite(order.price) ? `Filled: ${order.filled} @ $${order.price.toFixed(4)} ${val ? '(' + val + ')' : ''}` : null,
      Number.isFinite(order.pnl) ? `Realized P&L: ${order.pnl >= 0 ? '+' : ''}$${order.pnl.toFixed(2)}` : null
    ];
    event('fills', `${order.side.toUpperCase()} filled · ${order.symbol}`, details);
  }
  if (prior) Object.assign(prior, order);
  else state.orders.unshift(order);
}
function catalogEntry(row, assetClass) {
  const symbol = canonicalSymbol(row.symbol, assetClass);
  const name = String(row.name || symbol);
  const crypto = assetClass === 'crypto';
  const rules = { increment: +row.min_trade_increment, minimum: +row.min_order_size, tick: +row.price_increment, minValue: 0 };
  const supported = assetClass === 'us_equity' ? /^[A-Z0-9][A-Z0-9.-]*$/.test(symbol) :
    crypto && /^[A-Z0-9]+\/USD$/.test(symbol) && row.fractionable &&
    [rules.increment, rules.minimum, rules.tick].every(value => Number.isFinite(value) && value > 0);
  return { symbol, name, assetClass, tradable: row.tradable === true, supported: Boolean(supported), ...(crypto ? { rules } : {}) };
}

async function refreshAssets(assetClass) {
  if (Date.now() - (assetFetchedAt[assetClass] ?? 0) < 900000) return;
  assetFetchedAt[assetClass] = Date.now();
  try {
    const assets = await broker('/assets?status=active&asset_class=' + assetClass);
    if (!Array.isArray(assets)) throw Error('Invalid asset response');
    const entries = assets.filter(asset => asset.class === assetClass && typeof asset.symbol === 'string')
      .map(asset => catalogEntry(asset, assetClass));
    if (assetClass === 'us_equity' || assetClass === 'crypto') {
      for (const { symbol } of catalog.get(assetClass) ?? []) {
        eligible.delete(symbol);
        cryptoRules.delete(symbol);
      }
      for (const entry of entries) {
        if (!entry.tradable || !entry.supported) continue;
        eligible.add(entry.symbol);
        if (entry.rules) cryptoRules.set(entry.symbol, entry.rules);
      }
    }
    catalog.set(assetClass, entries);
    assetFailures.delete(assetClass);
  } catch {
    assetFailures.add(assetClass);
    assetFetchedAt[assetClass] = Date.now() - 840000;
    event('connections', 'Alpaca asset catalog could not load ' + assetClass);
  }
}

function searchAssets(input) {
  const query = typeof input.query === 'string' ? input.query.trim().toUpperCase().slice(0, 80) : '';
  const offset = Number.isSafeInteger(input.offset) ? Math.max(0, input.offset) : 0;
  const classes = input.assetClass ? catalogClasses.filter(value => value === input.assetClass) : catalogClasses;
  const source = demo ? symbols.map(symbol => ({
    symbol, name: instruments[symbol][0], assetClass: isCrypto(symbol) ? 'crypto' : 'us_equity', tradable: true, supported: true
  })).filter(asset => classes.includes(asset.assetClass)) : classes.flatMap(value => catalog.get(value) ?? []);
  const matching = source.filter(asset => (!input.eligible || (asset.supported && asset.tradable && assetEligible(asset.symbol))) &&
    (!query || asset.symbol.includes(query) || asset.name.toUpperCase().includes(query)));
  const rank = asset => asset.symbol === query ? 0 : asset.symbol.startsWith(query) ? 1 : 2;
  matching.sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
  return {
    total: matching.length, offset, demo, partial: !demo && classes.some(value => !catalog.has(value) || assetFailures.has(value)),
    items: matching.slice(offset, offset + 30).map(({ rules, ...asset }) => ({
      ...asset, eligible: asset.supported && asset.tradable && assetEligible(asset.symbol)
    }))
  };
}
async function refreshAdditionalAssets() {
  for (const assetClass of catalogClasses.slice(2)) await refreshAssets(assetClass);
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
        // Require repeated broker confirmations before releasing the symbol.
        item.firstMissingAt ??= Date.now();
        if (Date.now() - item.firstMissingAt >= staleOrderMs) {
          item.status = 'rejected';
          event('fills', 'Order absent from broker after reconciliation', [item.symbol, item.client]);
        }
      }
      if (item.side === 'buy' && item.id && !terminal.has(item.status) && item.status !== 'unknown' &&
        Date.now() - Date.parse(item.t) > staleOrderMs) {
        try {
          await broker('/orders/' + encodeURIComponent(item.id), { method: 'DELETE' });
          event('fills', 'Canceled stale ' + item.symbol + ' buy order');
        } catch (error) {
          if (![404, 422].includes(error.status)) throw error;
        }
      }
    }
    state.positions = positions.map(p => ({ symbol: canonicalSymbol(p.symbol, p.asset_class), assetClass: p.asset_class, qty: +p.qty, entry: +p.avg_entry_price, price: +p.current_price }));
    state.account = {
      equity: +account.equity, cash: +account.cash, buyingPower: +account.buying_power, dayStart: +account.last_equity,
      cryptoBuyingPower: account.non_marginable_buying_power == null ? +account.cash : +account.non_marginable_buying_power,
      exposure: positions.reduce((sum, p) => sum + Math.abs(+p.market_value), 0)
    };
    const trading = !account.trading_blocked && !account.account_blocked && account.status === 'ACTIVE';
    state.sessionOpen = Boolean(clock?.is_open) && trading;
    state.cryptoSessionOpen = trading && (account.crypto_status == null || account.crypto_status === 'ACTIVE');
  }
  if (state.broker === 'offline') feedEpoch.feed = feedEpoch.cryptoFeed = Date.now();
  state.broker = demo ? 'simulated' : 'connected';
  brokerAt = Date.now();
}

async function removeBot(bot) {
  delete state.bots[bot.id];
  if (perBotAiProviders.delete(bot.id)) await saveAiSecrets();
}

async function reconcileClosingBots() {
  let positions;
  for (const bot of Object.values(state.bots)) {
    if (!bot.closingOrder) continue;
    const order = state.orders.find(item => item.client === bot.closingOrder);
    if (!order || !terminal.has(order.status) || unresolvedFor(bot.symbol)) continue;
    if (!positions) {
      try {
        positions = demo ? state.positions : (await broker('/positions')).map(position => ({
          symbol: canonicalSymbol(position.symbol, position.asset_class), qty: +position.qty
        }));
      } catch {
        return; // Keep the deletion pending and retry position confirmation on the next cycle.
      }
    }
    if (positions.some(position => position.symbol === bot.symbol && position.qty !== 0)) {
      bot.closingOrder = null;
      bot.status = 'Liquidation incomplete. Position remains open.';
      event('risk', bot.status, [bot.name, bot.symbol]);
      continue;
    }
    await removeBot(bot);
    event('risk', `Deleted bot · ${bot.name}`, [`${bot.symbol} position confirmed closed`]);
  }
}
function ready(symbol, protective = false) {
  const bar = state.bars[symbol]?.at(-1);
  const key = feedKey(symbol);
  const open = demo || (isCrypto(symbol) ? state.cryptoSessionOpen : state.sessionOpen);
  return eligible.has(symbol) && (state[key] === 'live' || state[key] === 'simulated' || state[key] === 'polling') && Date.now() - brokerAt < 20000 &&
    brokerAt >= feedEpoch[key] && open && (
      (protective && freshQuote(symbol)) || (bar && Date.now() - Date.parse(bar.t) < maxAge)
    );
}
const unresolvedFor = symbol => state.orders.some(order => order.symbol === symbol && !terminal.has(order.status));

function freshQuote(symbol) {
  const quote = state.quotes[symbol];
  return quote && Date.now() - Date.parse(quote.t) < maxAge ? quote : null;
}

function quotePrice(symbol, bar) {
  return freshQuote(symbol)?.price ?? bar?.c;
}

const botOrders = id => state.orders.filter(order => order.owned && order.strategyId === id);
function strategyKnowledge(s, side, freeRoam) {
  const focus = freeRoam ? /\b(entry|buy|exit|sell|setup|stop|risk|hold)\b/gi :
    side === 'buy' ? /\b(entry|buy|setup|stop|risk|avoid)\b/gi : /\b(exit|sell|stop|risk|hold|target)\b/gi;
  return (s.knowledgeIds ?? []).flatMap(id => {
    const file = state.knowledge?.find(item => item.id === id);
    if (!file) return [];
    const chunks = file.text.split(/\n\s*\n/).flatMap(paragraph => paragraph.match(/[\s\S]{1,1500}/g) ?? []);
    const ranked = chunks.map((text, index) => ({ text, index, score: (text.match(focus) ?? []).length }));
    const excerpts = ranked.toSorted((a, b) => b.score - a.score).slice(0, 3)
      .sort((a, b) => a.index - b.index).map(chunk => chunk.text);
    return [{ name: file.name, excerpts }];
  });
}

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

function positionMatchesLedger(position, ledger, rules) {
  const tolerance = rules ? 0.00000001 : 0.000001;
  const feeAllowance = rules ? Math.max(tolerance, (ledger.boughtQty ?? 0) * 0.01) : tolerance;
  if (position) {
    if (position.qty <= 0) return false;
    if (position.qty > ledger.qty + tolerance) return false;
    return ledger.qty - position.qty <= feeAllowance;
  }
  return ledger.qty >= -tolerance && ledger.qty <= feeAllowance;
}

async function recentNews(symbol) {
  if (demo) return [];
  const cached = newsCache.get(symbol);
  if (cached && Date.now() - cached.at < 300000) return cached.items;
  try {
    const query = isCrypto(symbol) ? symbol.replace('/', '') : symbol;
    const data = await request('https://data.alpaca.markets', '/v1beta1/news?symbols=' + encodeURIComponent(query) + '&limit=3');
    const items = (data?.news ?? []).map(n => ({ headline: n.headline, t: n.created_at }));
    newsCache.set(symbol, { at: Date.now(), items });
    return items;
  } catch {
    return [];
  }
}

function orderContext(bot, s, bars, series = strategyBars(s, bars)) {
  const position = state.positions.find(p => p.symbol === s.symbol);
  const ledger = botLedger(botOrders(bot.id), s.symbol, hasBudget(bot.budget) ? bot.budget : null);
  const rules = isCrypto(s.symbol) ? cryptoRules.get(s.symbol) : null;
  if (!positionMatchesLedger(position, ledger, rules)) return null;
  const tf = s.timeframe ?? '1Min';
  const bar = series.at(-1) ?? bars.at(-1);
  const price = quotePrice(s.symbol, bars.at(-1));
  const accountReserved = reservedBuys(state.orders);
  const freeCash = accountReserved === null ? 0 : Math.max(0, state.account.cash - accountReserved);
  const freeBuyingPower = accountReserved === null ? 0 : Math.max(0, state.account.buyingPower - accountReserved);
  const freeCrypto = accountReserved === null ? 0 : Math.max(0, (state.account.cryptoBuyingPower ?? state.account.cash) - accountReserved);
  const cash = Math.min(freeCash, freeBuyingPower, ledger.available, rules ? freeCrypto : Infinity);
  const botReserved = reservedBuys(botOrders(bot.id)) ?? 0;
  const botExposure = (position ? position.qty * price : 0) + botReserved;
  const account = { ...state.account, cash, exposure: botExposure };
  const warmupNeeded = ruleWarmupBars(s);
  const window = strategyWindow(s, series, warmupNeeded);
  const warmedUp = window.length >= warmupNeeded;
  const cooldown = bot.cooldownBars ?? 0;
  const volume = Number.isFinite(bar?.v) ? bar.v : undefined;
  const atr = s.atrStop > 0 ? computeATR(window, Math.min(14, s.period)) : null;
  if (position?.qty > 0) {
    bot.highWater = Math.max(bot.highWater ?? position.entry, price);
  } else {
    bot.highWater = null;
    bot.holdBars = 0;
  }
  return {
    position, price, ledger, cash, rules, warmedUp, warmupCount: window.length, warmupNeeded, cooldown, volume, atr, timeframe: tf,
    proposal: decision(s, window.map(b => b.c), account, position, price, rules, {
      warmedUp, cooldown, volume, atr, bars: window, highWater: bot.highWater, holdBars: bot.holdBars ?? 0
    })
  };
}

function currentCandidate(candidate) {
  const { bot, s, bar, epoch, expires, proposal } = candidate;
  return state.bots[bot.id] === bot && bot.desired === 'running' && feedEpoch[feedKey(s.symbol)] === epoch &&
    Date.now() < expires && ready(s.symbol, proposal.protective) &&
    (proposal.protective || strategyBars(s).at(-1)?.t === bar.t);
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
  const { bot, s, proposal, bars, price, position } = job;
  const provider = providerFor(s);
  let model, error;
  try {
    const headlines = await recentNews(s.symbol);
    const rich = s.mode === 'ai_notepad' || s.mode === 'ai_autonomous';
    const indicators = rich ? {
      sma12: indicatorValue(bars, { indicator: 'sma', period: 12 }),
      ema9: indicatorValue(bars, { indicator: 'ema', period: 9 }),
      ema20: indicatorValue(bars, { indicator: 'ema', period: 20 }),
      ema50: indicatorValue(bars, { indicator: 'ema', period: 50 }),
      rsi14: computeRSI(bars.map(b => b.c), 14),
      macd: indicatorValue(bars, { indicator: 'macd' }),
      macdSignal: indicatorValue(bars, { indicator: 'macd_signal' }),
      bbUpper: indicatorValue(bars, { indicator: 'bb_upper', period: 20 }),
      bbLower: indicatorValue(bars, { indicator: 'bb_lower', period: 20 }),
      atr14: computeATR(bars, 14)
    } : undefined;
    const ledger = s.mode === 'ai_autonomous' ? botLedger(botOrders(bot.id), s.symbol, bot.budget) : null;
    const recentDecisions = s.mode === 'ai_autonomous'
      ? state.signals.filter(sig => sig.strategyId === bot.id).slice(0, 5).map(sig => ({ t: sig.t, side: sig.direction, rationale: sig.rationale }))
      : undefined;
    const knowledge = proposal.aiAutonomous ? strategyKnowledge(s, proposal.side, proposal.aiFreeRoam) : [];
    model = await assessSignal(provider, s.symbol, proposal.side, bars, fetch, {
      price, rationale: proposal.rationale, period: s.period, mode: s.mode ?? 'momentum', timeframe: s.timeframe ?? '1Min',
      ...(proposal.aiAutonomous ? { aiAutonomous: true, aiNotes: s.aiNotes, indicators } : {}),
      ...(proposal.aiFreeRoam ? {
        aiFreeRoam: true, aiRiskProfile: s.aiRiskProfile ?? 'balanced', aiSizing: s.aiSizing ?? 'dynamic',
        roundTripFeeBps: isCrypto(s.symbol) ? 50 : 2,
        budget: ledger ? { allocated: bot.budget, available: Number(ledger.available.toFixed(2)), realized: Number(ledger.realized.toFixed(2)) } : undefined,
        recentDecisions
      } : {}),
      ...(s.aiPrompt ? { aiPrompt: s.aiPrompt } : {}),
      ...(knowledge.length ? { knowledge } : {}),
      ...(headlines.length ? { headlines } : {}),
      position: position ? { qty: position.qty, entry: position.entry, pnlPct: Number((100 * (price / position.entry - 1)).toFixed(2)) } : null
    });
    if (knowledge.length) model.knowledgeSources = knowledge.map(file => file.name);
  } catch (failure) { error = failure; }
  activeAI--;
  drainAI();
  try {
    await serial(async () => {
      if (!currentCandidate(job)) return;
      if (error) {
        bot.status = error.message;
        const keySource = keySourceFor(s, bot.id);
        const detail = describeAiError(error, provider, keySource);
        if (error.status === 429 || error.message.includes('(429)')) bot.aiBackoffUntil = Date.now() + 5 * 60000;
        bot.lastAiError = { t: time(), status: error.status ?? null, message: error.message, detail, keySource, provider: provider?.name ?? null, model: provider?.model ?? null };
        logEntry('ai', 'error', `${bot.name} · ${error.message}`, { botId: bot.id, bot: bot.name, symbol: s.symbol, detail });
      } else {
        bot.status = 'Running';
        bot.aiBackoffUntil = 0;
        bot.lastAiError = null;
        logEntry('ai', model.side === 'hold' ? 'info' : 'good', `${bot.name} AI → ${model.side.toUpperCase()}${proposal.aiFreeRoam && model.side !== 'hold' ? ` (${model.allocationPct ?? 100}%)` : ''}`, { botId: bot.id, bot: bot.name, symbol: s.symbol, detail: `${model.rationale} [${keySourceFor(s, bot.id)}]` });
        const shouldAct = proposal.aiFreeRoam ? model.side !== 'hold' : model.side === proposal.side;
        if (shouldAct && !unresolvedFor(s.symbol)) {
          try { await reconcile(); }
          catch (failure) {
            state.broker = 'offline';
            brokerAt = 0;
            bot.status = 'Waiting for fresh feed and broker';
            event('connections', 'Broker reconciliation failed', [failure?.message || 'Unknown error']);
          }
        }
        if (!currentCandidate(job)) return;
        try { await applySignal(job, model); }
        catch (failure) {
          bot.status = failure.message;
          if (!failure.status || failure.status >= 500) {
            brokerAt = 0;
            state.broker = 'offline';
          }
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
  if (!ready(s.symbol, true)) {
    bot.status = !demo && !isCrypto(s.symbol) && state.broker === 'connected' && !state.sessionOpen
      ? 'Stock session closed or trading unavailable' : 'Waiting for fresh feed and broker';
    return;
  }
  const epoch = feedEpoch[feedKey(s.symbol)];
  const series = strategyBars(s, bars);
  const bar = series.at(-1);
  const position = state.positions.find(p => p.symbol === s.symbol);
  if (position?.qty > 0 && bar && bar.t !== bot.lastHoldBar) {
    const duration = timeframes[s.timeframe ?? '1Min'];
    const entry = !bot.holdBars && botOrders(bot.id).find(order => order.side === 'buy' && order.filled > 0);
    const enteredAt = entry ? Date.parse(entry.filledAt ?? entry.t) : -Infinity;
    const elapsed = (bot.lastHoldBar ? series.filter(candle => candle.t > bot.lastHoldBar) : [bar]).filter(candle => {
      const timestamp = Date.parse(candle.t);
      const closesAt = demo && duration === 60000 ? timestamp : (Math.floor(timestamp / duration) + 1) * duration;
      return closesAt >= enteredAt;
    });
    bot.holdBars = (bot.holdBars ?? 0) + elapsed.length;
    bot.lastHoldBar = bar.t;
  }
  const context = orderContext(bot, s, bars, series);
  if (!context) {
    bot.status = 'Position differs from strategy fills';
    bot.lastEvaluation = { t: bar?.t ?? time(), direction: 'hold', rationale: bot.status };
    return;
  }
  if (unresolvedFor(s.symbol)) { bot.status = 'Waiting for order reconciliation'; return; }
  if (context.proposal?.protective) {
    const mark = freshQuote(s.symbol) ?? bars.at(-1);
    await applySignal({ bot, s, bar: mark, proposal: context.proposal, epoch, expires: Date.now() + aiLifetime });
    return;
  }
  if (!ready(s.symbol)) return;
  if (!bar || Date.parse(bar.t) + (demo && s.timeframe === '1Min' ? 0 : timeframes[s.timeframe ?? '1Min']) < Math.max(bot.started, epoch)) {
    bot.status = 'Waiting for a new bar';
    return;
  }
  if (bar.t === bot.lastBar) return;
  const minimum = context.rules ? Math.max(context.rules.minValue, context.price * context.rules.minimum) : context.price;
  bot.status = !hasBudget(bot.budget) ? 'Budget required for new buys' :
    !context.ledger.complete ? 'Awaiting complete fill history' :
      !context.warmedUp && !context.position ? `Warming up candles (${context.warmupCount}/${context.warmupNeeded})` :
        context.cooldown > 0 && !context.position ? `Stop-loss cooldown (${context.cooldown} bars)` :
          !context.position && context.ledger.available < minimum ? 'Budget below minimum order size' : 'Running';
  const { proposal } = context;
  if (!proposal) {
    bot.lastBar = bar.t;
    if ((bot.cooldownBars ?? 0) > 0) bot.cooldownBars--;
    const rationale = !context.warmedUp && !context.position ? `Warming up: ${context.warmupCount}/${context.warmupNeeded} contiguous ${context.timeframe} candles` :
      context.cooldown > 0 && !context.position ? `Post-stop-loss cooldown (${context.cooldown} bars remaining)` :
        !context.rules && context.volume === 0 && !context.position ? 'Skipped zero-volume bar' :
          bot.status !== 'Running' ? bot.status :
            state.account.equity <= state.account.dayStart * (1 - s.dailyLoss / 100) ? 'Daily loss limit reached' :
              context.cash < minimum && !context.position ? 'Available buying power is below the minimum order' :
                context.position ? 'Holding the current position. No exit rule matched.' : 'No entry passed the strategy and risk rules.';
    bot.lastEvaluation = { t: bar.t, price: context.price, direction: 'hold', rationale };
    return;
  }
  const candidate = { bot, s, bar, proposal, price: context.price, position: context.position, epoch, expires: Date.now() + aiLifetime };
  if (s.ai && !proposal.protective) {
    if (!providerFor(s)) {
      bot.status = 'Configure an AI API key in Settings or .env';
      return;
    }
    if (bot.aiBackoffUntil && Date.now() < bot.aiBackoffUntil) {
      bot.status = 'AI rate-limit backoff (retrying shortly)';
      return;
    }
    const today = time().slice(0, 10);
    if (bot.aiCallsDay !== today) { bot.aiCallsDay = today; bot.aiCallsToday = 0; }
    if (s.mode === 'ai_autonomous' && s.aiDailyCap > 0 && (bot.aiCallsToday ?? 0) >= s.aiDailyCap) {
      bot.lastBar = bar.t;
      bot.status = `Daily AI call cap reached (${bot.aiCallsToday}/${s.aiDailyCap})`;
      bot.lastEvaluation = { t: bar.t, price: context.price, direction: 'hold', rationale: bot.status };
      logEntry('bot', 'warn', `${bot.name} paused AI calls (daily cap ${bot.aiCallsToday}/${s.aiDailyCap})`, { botId: bot.id, bot: bot.name, symbol: s.symbol });
      return;
    }
    const richBars = series.slice(s.mode === 'ai_notepad' || s.mode === 'ai_autonomous' ? -60 : -20);
    if (s.mode === 'ai_autonomous' && s.aiWakeMode === 'smart') {
      const wake = shouldWakeAutonomousAI(richBars, bot.lastAiWakeAt ?? 0);
      if (!wake.wake) {
        bot.lastBar = bar.t;
        bot.status = 'Running';
        bot.lastEvaluation = { t: bar.t, price: context.price, direction: 'hold', rationale: wake.trigger };
        return;
      }
      bot.lastAiWakeAt = Date.now();
    }
    if (pendingAI.has(bot.id) || pendingAI.size >= symbols.length) {
      bot.status = 'Waiting for AI capacity';
      return;
    }
    bot.aiCallsToday = (bot.aiCallsToday ?? 0) + 1;
    bot.lastBar = bar.t;
    bot.lastEvaluation = { t: bar.t, price: context.price, direction: proposal.side, rationale: proposal.rationale };
    pendingAI.set(bot.id, { ...candidate, bars: richBars });
    bot.status = s.mode === 'ai_autonomous' ? 'Autonomous AI analyzing market' : s.mode === 'ai_notepad' ? 'AI reading strategy notepad' : 'Awaiting AI confirmation';
    drainAI();
    return;
  }
  bot.lastBar = bar.t;
  bot.lastEvaluation = { t: bar.t, price: context.price, direction: proposal.side, rationale: proposal.rationale };
  await applySignal(candidate);
}

async function applySignal(candidate, model = null) {
  const { bot, s, bar, proposal } = candidate;
  const provider = providerFor(s);
  const allocSuffix = proposal.aiFreeRoam && model && model.side !== 'hold' && s.aiSizing === 'dynamic' ? ` [${model.allocationPct ?? 100}% size]` : '';
  const signal = {
    t: time(), symbol: s.symbol, direction: model?.side ?? proposal.side, rationale: (model?.rationale ?? proposal.rationale) + allocSuffix,
    strategyId: s.id, strategy: s.name, version: s.version, source: model ? (provider?.name ?? 'AI') : 'Strategy rules',
    ...(model?.knowledgeSources ? { knowledgeSources: model.knowledgeSources } : {})
  };
  state.signals.unshift(signal);
  bot.lastEvaluation = { ...bot.lastEvaluation, t: bar.t, direction: signal.direction, rationale: signal.rationale };
  state.signals.length = Math.min(100, state.signals.length);
  event('signals', `${signal.direction.toUpperCase()} signal · ${signal.symbol}`, [`Bot: ${s.name} v${s.version} · Source: ${signal.source}`, signal.rationale]);
  if (proposal.protective) event('risk', `${s.symbol} protective exit`, [`Bot: ${s.name}`, proposal.rationale]);
  const execSide = proposal.aiFreeRoam && model ? model.side : proposal.side;
  if (model && !proposal.aiFreeRoam && model.side !== proposal.side) return;
  if (execSide === 'hold') return;
  if (!currentCandidate(candidate) || unresolvedFor(s.symbol)) return;
  const context = orderContext(bot, s, state.bars[s.symbol]);
  if (!context) return;
  const { position, price: latest, proposal: validated, rules, cash } = context;
  if (!validated) return;
  if (validated.protective !== proposal.protective) return;
  if (!proposal.aiFreeRoam && validated.side !== execSide) return;
  if (execSide === 'sell' && !(position?.qty > 0)) return;
  if (execSide === 'buy' && position?.qty > 0 && !(proposal.aiFreeRoam && s.aiSizing === 'dynamic')) return;
  const rawLimit = execSide === 'buy'
    ? roundDown(latest * (1 + (rules && !demo ? cryptoSlippageBps : 0) / 10000), rules?.tick ?? 0.01)
    : null;
  const limitPrice = rawLimit && rawLimit > 0 ? rawLimit : null;
  const alloc = proposal.aiFreeRoam && model && s.aiSizing === 'dynamic' ? Math.max(0.25, Math.min(1, (model.allocationPct ?? 100) / 100)) : 1;
  let baseQty = execSide === 'sell'
    ? position.qty
    : position?.qty > 0
      ? Math.min(proposal.buyQty ?? 0, validated.buyQty ?? 0)
      : Math.min(proposal.qty, validated.qty);
  let rawQty = alloc < 1
    ? (rules ? roundDown(baseQty * alloc, rules.increment) : Math.floor(baseQty * alloc))
    : baseQty;
  if (execSide === 'buy' && limitPrice && rawQty * limitPrice > cash) {
    rawQty = rules ? roundDown(cash / limitPrice, rules.increment) : Math.floor(cash / limitPrice);
  }
  const qty = rules && execSide === 'sell' ? roundDown(rawQty, rules.increment) : rawQty;
  if (qty <= 0) return;
  if (rules && (qty + 1e-10 < rules.minimum || qty * (limitPrice ?? latest) < rules.minValue)) {
    bot.status = 'Order below crypto minimum';
    return;
  }
  const client = 'ft-' + createHash('sha256').update([s.id, s.version, bar.t, execSide].join('/')).digest('hex').slice(0, 40);
  if (state.orders.some(order => order.client === client)) return;
  const order = {
    client, owned: true, strategyId: s.id, strategy: s.name, version: s.version, symbol: s.symbol, side: execSide,
    qty, filled: 0, status: 'unknown', t: time(), price: null,
    limitPrice: demo ? null : limitPrice
  };
  if (demo) {
    order.status = 'filled';
    order.filled = qty;
    order.price = latest;
    order.filledAt = time();
    state.cash += qty * latest * (execSide === 'buy' ? -1 : 1);
    if (execSide === 'buy') {
      const existingPos = state.positions.find(p => p.symbol === s.symbol);
      if (existingPos) {
        const totalQty = existingPos.qty + qty;
        existingPos.entry = (existingPos.entry * existingPos.qty + latest * qty) / totalQty;
        existingPos.qty = Number(totalQty.toFixed(9));
        existingPos.price = latest;
      } else {
        state.positions.push({ symbol: s.symbol, qty, entry: latest, price: latest, strategy: s.name });
      }
    } else {
      order.pnl = qty * (latest - position.entry);
      if (proposal.stopLoss) bot.cooldownBars = s.cooldown ?? 0;
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
    const execution = execSide === 'buy' ? { type: 'limit', limit_price: rules ? decimal(order.limitPrice) : order.limitPrice.toFixed(2) } : { type: 'market' };
    const timeInForce = rules ? (execSide === 'buy' ? 'ioc' : 'gtc') : 'day';
    const submitted = await broker('/orders', {
      method: 'POST', body: JSON.stringify({
        symbol: s.symbol, qty: rules ? decimal(qty) : String(qty), side: execSide, ...execution, time_in_force: timeInForce, client_order_id: client
      })
    });
    updateOrder(normalize(submitted));
    if (proposal.stopLoss) bot.cooldownBars = s.cooldown ?? 0;
  } catch (error) {
    if ([400, 403, 422].includes(error.status)) {
      try { updateOrder(normalize(await broker('/orders:by_client_order_id?client_order_id=' + client))); }
      catch (lookup) { if (lookup.status === 404) order.status = 'rejected'; else throw lookup; }
    } else throw error;
  }
}
async function seedHistory(symbol) {
  const end = Date.now() - (isCrypto(symbol) || feed === 'iex' ? 1 : 16) * 60000;
  const bars = await history(symbol, Date.now() - 3 * 86400000, end);
  await serial(() => {
    const merged = new Map([...bars, ...(state.bars[symbol] ?? [])].map(bar => [bar.t, bar]));
    state.bars[symbol] = [...merged.values()].sort((a, b) => a.t.localeCompare(b.t)).slice(-1500);
  });
}
const timeframeHistory = new Map();
const timeframeLoads = new Map();
const timeframeRefreshAt = new Map();
const historyKey = s => s.symbol + ':' + s.timeframe;
const maxStrategyBars = 240;

function strategyBars(s, raw = state.bars[s.symbol] ?? []) {
  const recent = closedStrategyBars(raw, s.timeframe, Date.now(), demo);
  if (!s.timeframe || s.timeframe === '1Min') return recent;
  const key = historyKey(s);
  const historical = timeframeHistory.get(key);
  if (!historical) return recent;
  const merged = new Map(historical.map(bar => [bar.t, bar]));
  for (const bar of recent) {
    if (!merged.has(bar.t)) merged.set(bar.t, bar);
  }
  const result = [...merged.values()].sort((a, b) => a.t.localeCompare(b.t)).slice(-maxStrategyBars);
  timeframeHistory.set(key, result);
  return result;
}

function loadTimeframe(s) {
  if (!s.timeframe || s.timeframe === '1Min') return;
  const key = historyKey(s);
  if (timeframeLoads.has(key)) return timeframeLoads.get(key);
  if (Date.now() < (timeframeRefreshAt.get(key) ?? 0)) return;
  const duration = timeframes[s.timeframe];
  const end = Math.floor(Date.now() / duration) * duration;
  const days = demo || isCrypto(s.symbol) ? 1 + Math.ceil(maxStrategyBars * duration / 86400000) :
    { '5Min': 10, '15Min': 25, '1Hour': 65 }[s.timeframe];
  const load = history(s.symbol, end - days * 86400000, end - 1, s.timeframe)
    .then(bars => {
      const closed = closedStrategyBars(bars, s.timeframe, end).slice(-maxStrategyBars);
      if (closed.length) {
        timeframeHistory.set(key, closed);
        timeframeRefreshAt.set(key, Date.now() + 6 * 3600000);
      } else {
        timeframeRefreshAt.set(key, Date.now() + 60000);
      }
    })
    .catch(() => timeframeRefreshAt.set(key, Date.now() + 60000))
    .finally(() => timeframeLoads.delete(key));
  timeframeLoads.set(key, load);
  return load;
}

const historySeeded = new Set(symbols);
const historyRetryAt = new Map();
let seedingHistory = false;
function seedBotHistory(bots) {
  if (demo || seedingHistory) return;
  const bot = bots.find(({ symbol }) => eligible.has(symbol) && !historySeeded.has(symbol) &&
    Date.now() >= (historyRetryAt.get(symbol) ?? 0));
  if (!bot) return;
  const { symbol } = bot;
  seedingHistory = true;
  void seedHistory(symbol).then(() => {
    historySeeded.add(symbol);
    historyRetryAt.delete(symbol);
  }).catch(() => historyRetryAt.set(symbol, Date.now() + 60000))
    .finally(() => { seedingHistory = false; });
}
if (demo) {
  feedEpoch.feed = feedEpoch.cryptoFeed = Date.now() - 10000;
  for (const symbol of symbols) {
    if (!state.bars[symbol]?.length) state.bars[symbol] = synthetic(symbol, Date.now() - 86400000, Date.now(), 60000);
  }
} else {
  void refreshAdditionalAssets();
  setInterval(refreshAdditionalAssets, 60000);
  connect('feed');
  connect('cryptoFeed');
  for (const symbol of symbols) void seedHistory(symbol).catch(() => {});
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
      if (!demo) {
        await Promise.all([pollMarket('feed'), pollMarket('cryptoFeed')]);
      }
      try { await reconcile(); }
      catch (failure) {
        if (state.broker !== 'offline') event('connections', 'Broker reconciliation failed', [failure?.message || 'Unknown error']);
        state.broker = 'offline';
        brokerAt = 0;
      }
      if (brokerAt) await reconcileClosingBots();
      await advancePaperPortfolio();
      const bots = Object.values(state.bots).filter(bot => bot.desired === 'running');
      seedBotHistory(state.paperPortfolio?.running ? [...bots, state.paperPortfolio] : bots);
      for (const bot of bots) {
        const s = state.strategies.find(item => item.id === bot.id && item.version === bot.version);
        if (s && eligible.has(s.symbol)) void loadTimeframe(s);
      }
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
      await persist(false);
    });
  } catch (error) { console.error('Engine cycle:', error.message); }
  finally { busy = false; }
}
await cycle();
setInterval(cycle, 5000);

let pendingTelegramClose = null;
const tgEsc = v => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const tgUsd = v => Number.isFinite(v) ? (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const tgPct = v => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
const tgQty = v => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 8 }) : '—';

function botWinLoss(botId) {
  const filled = botOrders(botId).filter(o => o.filled > 0 && Number.isFinite(o.price)).sort((a, b) => (a.filledAt ?? a.t ?? '').localeCompare(b.filledAt ?? b.t ?? ''));
  let qty = 0, cost = 0, wins = 0, losses = 0;
  for (const o of filled) {
    if (o.side === 'buy') { qty += o.filled; cost += o.filled * o.price; }
    else if (o.side === 'sell') {
      const avg = qty > 0 ? cost / qty : null;
      const pnl = Number.isFinite(o.pnl) ? o.pnl : (avg !== null ? o.filled * (o.price - avg) : null);
      if (pnl !== null) { if (pnl > 0) wins++; else if (pnl < 0) losses++; }
      const used = qty > 0 ? cost * Math.min(1, o.filled / qty) : 0;
      qty = Math.max(0, qty - o.filled);
      cost = Math.max(0, cost - used);
    }
  }
  return { wins, losses, total: wins + losses };
}

function formatBotDetail(bot) {
  const s = state.strategies.find(item => item.id === bot.id && item.version === bot.version);
  const ledger = botLedger(botOrders(bot.id), bot.symbol, bot.budget);
  const wl = botWinLoss(bot.id);
  const pos = state.positions.find(p => p.symbol === bot.symbol && p.qty > 0);
  const mark = pos?.price ?? state.quotes[bot.symbol]?.price ?? state.bars[bot.symbol]?.at(-1)?.c ?? null;
  const heldQty = ledger.qty > 0 ? ledger.qty : 0;
  const avgEntry = heldQty > 0 && ledger.complete ? ledger.cost / heldQty : null;
  const mktVal = heldQty > 0 && Number.isFinite(mark) ? heldQty * mark : 0;
  const unreal = heldQty > 0 && ledger.complete && Number.isFinite(mark) ? mktVal - ledger.cost : 0;
  const unrealPct = ledger.cost > 0 ? 100 * (unreal / ledger.cost) : null;
  const wr = wl.total ? `${((100 * wl.wins) / wl.total).toFixed(0)}%` : '—';
  const stateIcon = bot.desired === 'running' ? (bot.lastAiError ? '🔴' : '🟢') : bot.desired === 'paused' ? '🟡' : '⚪';
  const modeStr = s?.mode === 'ai_autonomous' ? 'Autonomous AI' : s?.mode === 'ai_notepad' ? 'AI Notepad' : (s?.mode ?? 'rules');
  const holdingLine = heldQty > 0
    ? `• Holding: <code>${tgQty(heldQty)} ${tgEsc(bot.symbol)}</code> @ ${tgUsd(avgEntry)} → ${tgUsd(mark)} (${tgUsd(mktVal)})`
    : `• Holding: Flat (${bot.desired === 'running' ? 'Waiting to enter market' : bot.desired})`;
  const lines = [
    `${stateIcon} <b>${tgEsc(bot.name)}</b> (<code>${tgEsc(bot.symbol)}</code> · ${tgEsc(modeStr)} · ${tgEsc(s?.timeframe ?? '1Min')})`,
    `• Status: <b>${tgEsc(bot.desired === 'running' ? bot.status : bot.desired)}</b>`,
    `• Budget: ${tgUsd(bot.budget)} | Available: ${tgUsd(ledger.available)} | Invested: ${tgUsd(ledger.invested)}`,
    holdingLine,
    `• Unrealized P&amp;L: <b>${tgUsd(unreal)}</b>${unrealPct !== null ? ` (${tgPct(unrealPct)})` : ''} | Realized: <b>${tgUsd(ledger.realized)}</b>`,
    `• Trades: <b>${ledger.buyFills + ledger.sellFills}</b> (${ledger.buyFills}B / ${ledger.sellFills}S) | W/L: <b>${wl.wins}W / ${wl.losses}L</b> (${wr})`
  ];
  if (s?.ai) {
    const aiLine = bot.lastAiError
      ? `• AI Health: ❌ ${tgEsc(bot.lastAiError.message)}`
      : `• AI Health: ✅ Healthy${s.mode === 'ai_autonomous' ? ` (${bot.aiCallsToday ?? 0}${s.aiDailyCap ? '/' + s.aiDailyCap : ''} calls today)` : ''}`;
    lines.push(aiLine);
  }
  if (bot.lastEvaluation?.rationale) {
    lines.push(`• Latest: <i>${tgEsc(bot.lastEvaluation.rationale.slice(0, 120))}</i>`);
  }
  return lines.join('\n');
}

function findBotByQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const list = Object.values(state.bots);
  return list.find(b => b.name.toLowerCase() === q || b.symbol.toLowerCase() === q || b.id === q)
    ?? list.find(b => b.name.toLowerCase().includes(q) || b.symbol.toLowerCase().includes(q));
}

function resolveSymbolQuery(query) {
  const q = query.trim().toUpperCase();
  if (!q) return null;
  return symbols.find(s => s === q || s === q + '/USD' || s.replace('/', '') === q) ?? null;
}

async function handleTelegramCommand(cmd, arg) {
  if (cmd === 'start' || cmd === 'help') {
    return [
      '🤖 <b>FastTrader Telegram Commands</b>',
      '',
      '<b>Info &amp; Monitoring</b>',
      '/status — Account equity, P&amp;L, broker &amp; feed health',
      '/bots — Full details for every bot (invested, P&amp;L, W/L, holding)',
      '/bot &lt;name&gt; — Deep details for a single bot',
      '/positions — Open broker positions &amp; unrealized P&amp;L',
      '/pnl — Realized + unrealized P&amp;L and win/loss summary',
      '/trades — Latest 8 filled orders',
      '/signals — Latest 8 AI &amp; rule decisions',
      '/logs — Latest 10 workspace logs',
      '/errors — Recent warnings &amp; AI/broker errors',
      '/price &lt;symbol&gt; — Live price, 1H change &amp; RSI/EMA',
      '',
      '<b>Remote Controls</b>',
      '/pause &lt;bot&gt; — Pause a bot',
      '/resume &lt;bot&gt; — Resume a paused bot',
      '/pauseall — Pause all running bots immediately',
      '/close &lt;symbol&gt; — Liquidate an open position (requires /confirm)'
    ].join('\n');
  }
  if (cmd === 'status') {
    const a = state.account;
    const dayPnl = Number.isFinite(a.equity) && Number.isFinite(a.dayStart) ? a.equity - a.dayStart : null;
    const dayPct = a.dayStart > 0 && dayPnl !== null ? 100 * (dayPnl / a.dayStart) : null;
    const bots = Object.values(state.bots);
    const active = bots.filter(b => b.desired === 'running').length;
    const paused = bots.filter(b => b.desired === 'paused').length;
    const aiErrs = bots.filter(b => b.lastAiError).length;
    return [
      `📊 <b>FastTrader Status</b> (<code>${tgEsc(mode)}</code>)`,
      `• Equity: <b>${tgUsd(a.equity)}</b> (${tgUsd(dayPnl)} / ${tgPct(dayPct)} today)`,
      `• Cash: ${tgUsd(a.cash)} | Exposure: ${tgUsd(a.exposure)}`,
      `• Broker: <code>${tgEsc(state.broker)}</code> | Stock: <code>${tgEsc(state.feed)}</code> | Crypto: <code>${tgEsc(state.cryptoFeed)}</code>`,
      `• Bots: <b>${active} active</b>, ${paused} paused (${bots.length} total)${aiErrs ? ` · ⚠️ ${aiErrs} AI error(s)` : ''}`,
      `• Open positions: <b>${state.positions.length}</b>`
    ].join('\n');
  }
  if (cmd === 'bots' || cmd === 'bot') {
    const bots = arg ? [findBotByQuery(arg)].filter(Boolean) : Object.values(state.bots);
    if (!bots.length) return arg ? `No bot found matching "<code>${tgEsc(arg)}</code>".` : 'No bots configured yet.';
    return `🤖 <b>Bot Details (${bots.length})</b>\n\n` + bots.map(formatBotDetail).join('\n\n');
  }
  if (cmd === 'positions') {
    if (!state.positions.length) return '📭 <b>No open positions.</b>';
    const lines = state.positions.map(p => {
      const val = p.qty * p.price;
      const pnl = p.qty * (p.price - p.entry);
      const pctChg = p.entry > 0 ? 100 * (p.price / p.entry - 1) : null;
      return `• <b>${tgEsc(p.symbol)}</b>: <code>${tgQty(p.qty)}</code> @ ${tgUsd(p.entry)} → ${tgUsd(p.price)}\n  Value: ${tgUsd(val)} | P&amp;L: <b>${tgUsd(pnl)}</b> (${tgPct(pctChg)})`;
    });
    return `📦 <b>Open Positions (${state.positions.length})</b>\n\n` + lines.join('\n');
  }
  if (cmd === 'pnl') {
    const unreal = state.positions.reduce((sum, p) => sum + p.qty * (p.price - p.entry), 0);
    let realized = 0, wins = 0, losses = 0, trades = 0;
    for (const bot of Object.values(state.bots)) {
      const l = botLedger(botOrders(bot.id), bot.symbol, bot.budget);
      const wl = botWinLoss(bot.id);
      realized += l.realized;
      wins += wl.wins;
      losses += wl.losses;
      trades += l.buyFills + l.sellFills;
    }
    const wr = wins + losses ? `${((100 * wins) / (wins + losses)).toFixed(1)}%` : '—';
    const dayPnl = Number.isFinite(state.account.equity) && Number.isFinite(state.account.dayStart) ? state.account.equity - state.account.dayStart : null;
    return [
      '💰 <b>P&amp;L Summary</b>',
      `• Today's Equity P&amp;L: <b>${tgUsd(dayPnl)}</b>`,
      `• Unrealized P&amp;L: <b>${tgUsd(unreal)}</b>`,
      `• Bot Realized P&amp;L: <b>${tgUsd(realized)}</b>`,
      `• Total Bot Fills: <b>${trades}</b> | Win/Loss: <b>${wins}W / ${losses}L</b> (${wr})`
    ].join('\n');
  }
  if (cmd === 'trades') {
    const filled = state.orders.filter(o => o.filled > 0).slice(0, 8);
    if (!filled.length) return '📭 No filled trades recorded yet.';
    const lines = filled.map(o => `${o.side === 'buy' ? '🟢' : '🔴'} <b>${o.side.toUpperCase()} ${tgEsc(o.symbol)}</b> · <code>${tgQty(o.filled)}</code> @ ${tgUsd(o.price)}\n  ${tgEsc(o.strategy ?? 'External')} · ${tgEsc((o.filledAt ?? o.t ?? '').slice(0, 16).replace('T', ' '))}`);
    return `🧾 <b>Latest Filled Trades (${filled.length})</b>\n\n` + lines.join('\n');
  }
  if (cmd === 'signals') {
    const sigs = state.signals.slice(0, 8);
    if (!sigs.length) return '📭 No signals logged yet.';
    const lines = sigs.map(s => `⚡ <b>${s.direction.toUpperCase()} ${tgEsc(s.symbol)}</b> (${tgEsc(s.strategy)} · ${tgEsc(s.source)})\n  <i>${tgEsc(s.rationale)}</i>`);
    return `📡 <b>Latest Signals (${sigs.length})</b>\n\n` + lines.join('\n');
  }
  if (cmd === 'logs') {
    const items = (state.logs ?? []).slice(0, 10);
    if (!items.length) return '📭 No activity logs yet.';
    const lines = items.map(l => `[<code>${tgEsc((l.category ?? 'sys').toUpperCase())}</code>] <b>${tgEsc(l.message)}</b>${l.detail ? `\n  ${tgEsc(l.detail.slice(0, 120))}` : ''}`);
    return `📋 <b>Latest Logs (${items.length})</b>\n\n` + lines.join('\n');
  }
  if (cmd === 'errors') {
    const errs = (state.logs ?? []).filter(l => l.level === 'error' || l.level === 'warn').slice(0, 10);
    const botErrs = Object.values(state.bots).filter(b => b.lastAiError).map(b => `🔴 <b>${tgEsc(b.name)}</b> (${tgEsc(b.symbol)}): ${tgEsc(b.lastAiError.detail)}`);
    if (!errs.length && !botErrs.length) return '✅ <b>No recent warnings or errors.</b> All systems clean.';
    const parts = [];
    if (botErrs.length) parts.push('<b>Active Bot AI Errors</b>\n' + botErrs.join('\n'));
    if (errs.length) parts.push('<b>Recent Warnings &amp; Errors</b>\n' + errs.map(l => `• [${tgEsc(l.category)}] <b>${tgEsc(l.message)}</b>${l.detail ? ` — ${tgEsc(l.detail.slice(0, 120))}` : ''}`).join('\n'));
    return parts.join('\n\n');
  }
  if (cmd === 'price') {
    const sym = resolveSymbolQuery(arg || 'BTC/USD');
    if (!sym) return `Unknown symbol "<code>${tgEsc(arg)}</code>". Try: ${symbols.join(', ')}`;
    const bars = state.bars[sym] ?? [];
    const last = bars.at(-1);
    const px = state.quotes[sym]?.price ?? last?.c ?? null;
    const first = bars.at(-60)?.c;
    const chg = first && px ? 100 * (px / first - 1) : null;
    const rsi = computeRSI(bars.map(b => b.c), 14);
    const ema20 = indicatorValue(bars, { indicator: 'ema', period: 20 });
    return [
      `📈 <b>${tgEsc(sym)}</b> — ${tgEsc(instruments[sym][0])}`,
      `• Live Price: <b>${tgUsd(px)}</b> (1H: ${tgPct(chg)})`,
      `• RSI(14): <code>${rsi !== null ? rsi.toFixed(1) : '—'}</code> | EMA(20): <code>${tgUsd(ema20)}</code>`,
      `• Bars cached: ${bars.length}`
    ].join('\n');
  }
  if (cmd === 'pause' || cmd === 'resume') {
    const bot = findBotByQuery(arg);
    if (!bot) return `Specify a bot name, e.g. <code>/${cmd} Aitrader</code>.\nBots: ${Object.values(state.bots).map(b => tgEsc(b.name)).join(', ') || 'none'}`;
    const action = cmd === 'pause' ? 'paused' : 'running';
    await serial(async () => {
      await change('/api/bot', { id: bot.id, version: bot.version, action, ...(bot.budget ? { budget: bot.budget } : {}) });
      await persist();
    });
    return `${action === 'paused' ? '🟡 Paused' : '🟢 Resumed'} <b>${tgEsc(bot.name)}</b> (<code>${tgEsc(bot.symbol)}</code>).`;
  }
  if (cmd === 'pauseall') {
    const running = Object.values(state.bots).filter(b => b.desired === 'running');
    if (!running.length) return 'No running bots to pause.';
    await serial(async () => {
      for (const bot of running) {
        await change('/api/bot', { id: bot.id, version: bot.version, action: 'paused', ...(bot.budget ? { budget: bot.budget } : {}) });
      }
      await persist();
    });
    return `🛑 <b>Paused ${running.length} bot(s):</b>\n` + running.map(b => `• ${tgEsc(b.name)} (${tgEsc(b.symbol)})`).join('\n');
  }
  if (cmd === 'close') {
    const sym = resolveSymbolQuery(arg);
    if (!sym) return `Specify an open symbol, e.g. <code>/close BTC/USD</code>.`;
    const pos = state.positions.find(p => p.symbol === sym && p.qty > 0);
    if (!pos) return `No open position found for <code>${tgEsc(sym)}</code>.`;
    const bot = Object.values(state.bots).find(b => b.symbol === sym);
    if (!bot) return `Position <code>${tgEsc(sym)}</code> has no assigned bot. Assign or close it from the FastTrader UI.`;
    pendingTelegramClose = { botId: bot.id, symbol: sym, qty: pos.qty, expires: Date.now() + 60000 };
    return `⚠️ <b>Confirm Market Liquidation</b>\nClose <code>${tgQty(pos.qty)} ${tgEsc(sym)}</code> (~${tgUsd(pos.qty * pos.price)}) and pause <b>${tgEsc(bot.name)}</b>?\n\nReply <code>/confirm</code> within 60 seconds to execute.`;
  }
  if (cmd === 'confirm') {
    if (!pendingTelegramClose || Date.now() > pendingTelegramClose.expires) {
      pendingTelegramClose = null;
      return 'No pending liquidation to confirm (expired or none requested).';
    }
    const target = pendingTelegramClose;
    pendingTelegramClose = null;
    await serial(async () => {
      await change('/api/bot', { liquidate: true, id: target.botId, pause: true });
      await persist();
    });
    return `🔴 <b>Submitted market sell</b> for <code>${tgEsc(target.symbol)}</code> and paused its bot.`;
  }
  return `Unknown command <code>/${tgEsc(cmd)}</code>. Type /help to see all commands.`;
}

if (telegram.configured) {
  telegram.startPolling(handleTelegramCommand, [
    { command: 'status', description: 'Account equity, P&L & system health' },
    { command: 'bots', description: 'Full bot details (invested, P&L, W/L, holding)' },
    { command: 'bot', description: 'Details for a specific bot by name' },
    { command: 'positions', description: 'Open broker positions & unrealized P&L' },
    { command: 'pnl', description: 'Realized & unrealized P&L summary' },
    { command: 'trades', description: 'Latest 8 filled orders' },
    { command: 'signals', description: 'Latest 8 AI & rule decisions' },
    { command: 'logs', description: 'Latest 10 workspace logs' },
    { command: 'errors', description: 'Recent warnings & AI/broker errors' },
    { command: 'price', description: 'Live price & RSI/EMA for a symbol' },
    { command: 'pause', description: 'Pause a bot by name' },
    { command: 'resume', description: 'Resume a paused bot by name' },
    { command: 'pauseall', description: 'Emergency pause all running bots' },
    { command: 'close', description: 'Close an open position (with /confirm)' },
    { command: 'help', description: 'List all FastTrader commands' }
  ]);
}

const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/strategy-playbooks.mjs': ['strategy-playbooks.mjs', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/sw.js': ['sw.js', 'text/javascript'], '/dashboard-ai.png': ['dashboard-ai.png', 'image/png'], '/mark.svg': ['mark.svg', 'image/svg+xml'], '/favicon.ico': ['mark.svg', 'image/svg+xml'] };
function snapshot() {
  const visibleSymbols = [...new Set([...trackedSymbols(), ...Object.values(state.bots).map(bot => bot.symbol), ...state.strategies.map(item => item.symbol)])];
  const market = visibleSymbols.map(symbol => {
    const assetClass = isCrypto(symbol) ? 'crypto' : 'us_equity';
    const name = instruments[symbol]?.[0] ?? catalog.get(assetClass)?.find(asset => asset.symbol === symbol)?.name ?? symbol;
    const crypto = isCrypto(symbol);
    const status = state[feedKey(symbol)];
    const bars = state.bars[symbol] ?? [];
    const first = bars.at(-60)?.c;
    const trade = state.quotes[symbol], last = bars.at(-1);
    const quote = trade && (!last || trade.t >= last.t) ? trade : { price: last?.c, t: last?.t };
    const window = bars.slice(-60);
    return {
      symbol, name, assetClass: crypto ? 'crypto' : 'stock', source: sourceFor(symbol),
      eligible: eligible.has(symbol) && (demo || !crypto || state.cryptoSessionOpen), ...quote, metricsAt: window.at(-1)?.t,
      change: first && quote.price ? 100 * (quote.price / first - 1) : null,
      volume: window.length ? window.reduce((sum, bar) => sum + (bar.v ?? 0) * (crypto ? bar.vw ?? bar.c : 1), 0) : null,
      volatility: first ? 100 * (Math.max(...window.map(bar => bar.c)) - Math.min(...window.map(bar => bar.c))) / first : null,
      freshness: Date.now() - Date.parse(quote.t) < maxAge && ['live', 'simulated', 'delayed', 'polling'].includes(status) ? status : status === 'delayed' ? 'delayed' : 'cached'
    };
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
  return {
    ...state, botSessions,
    paperPortfolio: state.paperPortfolio ? {
      ...paperPortfolioSummary(state.paperPortfolio), symbol: state.paperPortfolio.symbol,
      timeframe: state.paperPortfolio.timeframe, running: state.paperPortfolio.running,
      lastBar: state.paperPortfolio.lastBar, lossLocked: state.paperPortfolio.lossLocked
    } : null,
    knowledge: (state.knowledge ?? []).map(({ text, ...file }) => file),
    orders: state.orders.toSorted((a, b) => (b.t ?? '').localeCompare(a.t ?? '')).slice(0, 500),
    runs: state.runs.map(({ curve, trades, ...run }) => ({
      ...run, curve: curve.filter((_, idx) => idx % Math.ceil(curve.length / 650) === 0 || idx === curve.length - 1),
      tradeCount: trades.length, trades: trades.slice(-250)
    })),
    mode, accountKey: storeKey, supabaseConnected: remoteStore.enabled, telegramConfigured: telegram.configured, market,
    aiConfigured: Boolean(aiProvider), aiProvider: aiProvider?.name ?? null,
    botAiConfigured: Boolean(botAiProvider),
    botAiInfo: botAiProvider ? { provider: botAiProvider.name, model: botAiProvider.model, masked: maskKey(botAiProvider.key) } : null,
    botAiKeys: Object.fromEntries([...perBotAiProviders].map(([id, p]) => [id, { provider: p.name, model: p.model, masked: maskKey(p.key) }])),
    feedName: demo ? 'Synthetic market' : 'Alpaca ' + feed.toUpperCase()
  };
}
async function body(req, limit = 20000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buf.byteLength;
    if (bytes > limit) throw Object.assign(Error('Request too large'), { status: 413 });
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8') || '{}');
}
const idempotencyCache = new Map();
function readIdempotencyKey(req) {
  const raw = req.headers['idempotency-key'];
  return typeof raw === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(raw.trim()) ? raw.trim() : null;
}
function getIdempotent(cacheKey) {
  const entry = idempotencyCache.get(cacheKey);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) { idempotencyCache.delete(cacheKey); return undefined; }
  return entry.value;
}
function setIdempotent(cacheKey, value) {
  const now = Date.now();
  idempotencyCache.set(cacheKey, { value, expires: now + 300000 });
  if (idempotencyCache.size > 500) {
    for (const [k, v] of idempotencyCache) {
      if (v.expires <= now) idempotencyCache.delete(k);
    }
    while (idempotencyCache.size > 500) idempotencyCache.delete(idempotencyCache.keys().next().value);
  }
}
function testSavedAiKey(input) {
  const saved = typeof input.botId === 'string' && input.botId ? perBotAiProviders.get(input.botId) : botAiProvider;
  const candidate = input.key?.trim()
    ? { name: input.provider === 'OpenAI' ? 'OpenAI' : 'Gemini', key: input.key.trim(), model: input.model?.trim() || (input.provider === 'OpenAI' ? 'gpt-4.1-mini' : defaultGeminiModel) }
    : saved;
  if (!candidate) throw Error('Save or enter an API key first.');
  return testProviderKey(candidate);
}

async function change(path, input) {
  if (path === '/api/portfolio-session') {
    const current = state.paperPortfolio;
    if (input.action === 'pause' || input.action === 'resume') {
      if (!current) throw Error('Start a paper portfolio first.');
      current.running = input.action === 'resume';
      current.started = Date.now();
      for (const book of current.books) book.pending = null;
      return { running: current.running };
    }
    if (input.action !== 'start' || current) throw Error('This workspace already has a paper portfolio, or the action is invalid.');
    const { strategies, config } = portfolioSettings(input);
    const [first] = strategies;
    state.paperPortfolio = { ...createPaperPortfolio(strategies, config), running: true,
      symbol: first.symbol, timeframe: first.timeframe ?? '1Min', started: Date.now(), lastBar: null };
    return { running: true };
  }
  if (path === '/api/knowledge') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const text = typeof input.text === 'string' ? input.text.replace(/^\uFEFF/, '').trim() : '';
    if (name.length > 120 || /[\\/\x00-\x1f]/.test(name) || !/\.(txt|md|markdown)$/i.test(name)) {
      throw Error('Upload a .txt or .md strategy document with a filename up to 120 characters.');
    }
    const bytes = Buffer.byteLength(text);
    if (bytes < 10 || bytes > 32768 || /[\x00-\x08\x0b\x0c\x0e-\x1f\uFFFD]/.test(text)) {
      throw Error('Use a UTF-8 text document between 10 bytes and 32 KB.');
    }
    state.knowledge ??= [];
    const existing = state.knowledge.find(file => file.name === name && file.text === text);
    if (existing) return { id: existing.id, name, bytes, uploadedAt: existing.uploadedAt };
    if (state.knowledge.length >= 30) throw Error('This workspace already has 30 strategy documents.');
    const file = { id: randomUUID(), name, bytes, uploadedAt: time() };
    state.knowledge.unshift({ ...file, text });
    return file;
  }
  if (path === '/api/strategy') {
    const mutation = typeof input.mutation === 'string' && /^[a-f0-9-]{36}$/.test(input.mutation) ? input.mutation : null;
    const recorded = mutation && state.strategies.find(item => item.mutation === mutation);
    if (recorded) return recorded;
    const existing = state.strategies.find(item => item.id === input.id);
    const id = existing?.id ?? randomUUID();
    const latest = state.strategies.findLast(item => item.id === id);
    if (latest && latest.version !== input.baseVersion) throw Error('Strategy changed. Review the latest version before saving.');
    const item = { ...validateStrategy(input), id, version: (latest?.version ?? 0) + 1, mutation, sourceStrategy: latest?.sourceStrategy };
    if (item.knowledgeIds?.some(id => !state.knowledge?.some(file => file.id === id))) {
      throw Error('Select strategy documents from this workspace.');
    }
    state.strategies.push(item);
    if (item.mode === 'ai_autonomous' && !state.bots[id]) {
      const now = Date.now();
      state.bots[id] = {
        id: item.id, version: item.version, name: item.name, symbol: item.symbol,
        desired: 'paused', status: 'Set budget to enter market', budget: null,
        createdAt: now, started: now
      };
    }
    return item;
  }
  if (path === '/api/bot') {
    if (input.adopt === true) {
      const symbol = input.symbol;
      const position = state.positions.find(p => p.symbol === symbol && p.qty > 0);
      if (!position) throw Error('No open broker position found for ' + symbol + '.');
      const source = state.strategies.find(item => item.id === input.id && item.version === input.version);
      if (!source) throw Error('Choose a saved strategy version to manage this position.');
      const extra = input.addFunds === undefined ? 0 : Number(input.addFunds);
      if (!Number.isFinite(extra) || extra < 0 || extra > 1e9 || Math.abs(extra * 100 - Math.round(extra * 100)) > 0.0001) {
        throw Error('Additional funds must be $0 or more, in dollars and cents.');
      }
      const existingOwner = Object.values(state.bots).find(bot => {
        if (bot.symbol !== symbol) return false;
        const l = botLedger(botOrders(bot.id), symbol, bot.budget);
        return Math.abs(l.qty) > (isCrypto(symbol) ? 1e-8 : 1e-6);
      });
      if (existingOwner) throw Error('Bot "' + existingOwner.name + '" already manages this ' + symbol + ' position.');
      const active = Object.values(state.bots).find(bot => bot.desired === 'running' && bot.symbol === symbol);
      if (active) throw Error('Pause or stop the existing ' + symbol + ' bot before assigning this position.');
      if (!eligible.has(symbol)) throw Error('This instrument is awaiting Alpaca eligibility confirmation.');
      if (!demo && isCrypto(symbol) && !state.cryptoSessionOpen) throw Error('Crypto trading is unavailable on this Alpaca Paper account.');
      if (source.ai && !providerFor(source)) throw Error('Configure a Gemini or OpenAI API key in Settings or .env before starting this bot.');
      let s = source;
      if (source.symbol !== symbol) {
        const rootId = source.sourceStrategy?.rootId ?? source.id;
        const reused = state.strategies.find(item => item.symbol === symbol &&
          (item.sourceStrategy?.rootId ?? item.sourceStrategy?.id ?? item.id) === rootId);
        if (reused) s = reused;
        else {
          s = {
            ...validateStrategy({ ...source, symbol }), id: randomUUID(), version: 1,
            sourceStrategy: { id: source.id, version: source.version, symbol: source.symbol, rootId }
          };
          state.strategies.push(s);
        }
      }
      const adoptPrice = Number.isFinite(position.entry) && position.entry > 0 ? position.entry : position.price;
      if (!Number.isFinite(adoptPrice) || adoptPrice <= 0) throw Error('Position price is unavailable for adoption.');
      const priorLedger = botLedger(botOrders(s.id), symbol, null);
      const adoptedCost = position.qty * adoptPrice;
      const budget = Math.min(1e9, Number(Math.max(1, priorLedger.invested - Math.min(0, priorLedger.realized) + adoptedCost + extra).toFixed(2)));
      const nowIso = time();
      state.orders.unshift({
        client: 'ft-adopt-' + randomUUID().slice(0, 12),
        owned: true, adopted: true, strategyId: s.id, strategy: s.name, version: s.version,
        symbol, side: 'buy', qty: position.qty, filled: position.qty,
        status: 'filled', price: adoptPrice, limitPrice: null, filledAt: nowIso, t: nowIso
      });
      const prev = state.bots[s.id];
      state.bots[s.id] = {
        id: s.id, version: s.version, name: s.name, symbol, desired: 'running', status: 'Running',
        budget, createdAt: prev?.createdAt ?? Date.now(), started: Date.now(),
        highWater: Math.max(adoptPrice, position.price ?? adoptPrice), holdBars: 0,
        lastBar: prev?.symbol === symbol ? prev.lastBar : undefined,
        lastEvaluation: { t: nowIso, price: position.price ?? adoptPrice, direction: 'hold', rationale: 'Adopted open broker position (' + position.qty + ' ' + symbol + ')' }
      };
      event('fills', s.name + ' adopted open ' + symbol + ' position' + (extra > 0 ? ' + $' + extra.toFixed(2) + ' funds' : ''));
      return state.bots[s.id];
    }
    async function liquidateBotPosition(bot, { pause = false, deleteAfterFill = false, reason = 'Manual position liquidation requested' } = {}) {
      const symbol = bot.symbol;
      if (unresolvedFor(symbol)) throw Error('Wait for the existing ' + symbol + ' order to reconcile first.');
      const position = state.positions.find(p => p.symbol === symbol && p.qty > 0);
      if (!position) throw Error('No open ' + symbol + ' position to close.');
      const rules = isCrypto(symbol) ? cryptoRules.get(symbol) : null;
      const qty = rules ? roundDown(position.qty, rules.increment) : position.qty;
      if (qty <= 0 || (rules && qty + 1e-10 < rules.minimum)) throw Error('Open position is below the minimum tradable size.');
      const latest = quotePrice(symbol, state.bars[symbol]?.at(-1) ?? { c: position.price ?? position.entry });
      const client = 'ft-close-' + randomUUID().slice(0, 16);
      const order = {
        client, owned: true, strategyId: bot.id, strategy: bot.name, version: bot.version, symbol,
        side: 'sell', qty, filled: 0, status: 'unknown', t: time(), price: null, limitPrice: null
      };
      if (demo) {
        order.status = 'filled';
        order.filled = qty;
        order.price = latest;
        order.filledAt = time();
        order.pnl = qty * (latest - position.entry);
        state.cash += qty * latest;
        if (position.qty - qty > 1e-9) position.qty = Number((position.qty - qty).toFixed(9));
        else state.positions = state.positions.filter(p => p !== position);
        updateOrder(order);
        await reconcile();
      } else {
        if (deleteAfterFill) {
          bot.closingOrder = client;
          bot.desired = 'paused';
          bot.status = 'Liquidation pending';
        }
        state.orders.unshift(order);
        await persist();
        try {
          const decimal = value => value.toFixed(9).replace(/\.?0+$/, '');
          const submitted = await broker('/orders', {
            method: 'POST',
            body: JSON.stringify({
              symbol, qty: rules ? decimal(qty) : String(qty), side: 'sell',
              type: 'market', time_in_force: rules ? 'gtc' : 'day', client_order_id: client
            })
          });
          updateOrder(normalize(submitted));
        } catch (error) {
          if ([400, 403, 422].includes(error.status)) {
            try { updateOrder(normalize(await broker('/orders:by_client_order_id?client_order_id=' + client))); }
            catch (lookup) { if (lookup.status === 404) order.status = 'rejected'; else throw lookup; }
          }
          throw error;
        }
      }
      bot.highWater = null;
      bot.holdBars = 0;
      if (pause) { bot.desired = 'paused'; bot.status = 'paused'; }
      bot.lastEvaluation = { t: time(), price: latest, direction: 'sell', rationale: reason };
      return { order, qty, symbol };
    }
    if (input.delete === true) {
      const bot = state.bots[input.id];
      if (!bot) throw Error('Bot not found.');
      if (bot.closingOrder) throw Error('Wait for the liquidation order to reconcile.');
      if (!demo && input.liquidate === true) await reconcile();
      const symbol = bot.symbol;
      const position = state.positions.find(p => p.symbol === symbol && p.qty > 0);
      let order = null;
      if (input.liquidate === true && position) {
        const closed = await liquidateBotPosition(bot, { deleteAfterFill: true, reason: 'Liquidation requested before bot deletion' });
        order = closed.order;
        if (!demo || state.positions.some(item => item.symbol === symbol && item.qty !== 0)) {
          if (demo) {
            bot.desired = 'paused';
            bot.status = 'Liquidation incomplete. Position remains open.';
          }
          return { deleted: null, liquidated: false, pending: !demo, leftOpen: demo, order };
        }
      }
      await removeBot(bot);
      const details = order
        ? [`Bot: ${bot.name}`, `Liquidated ${order.qty} ${symbol} at market`]
        : position
          ? [`Bot: ${bot.name}`, `Left open ${position.qty} ${symbol} position unmanaged`]
          : [`Bot: ${bot.name}`, 'No open position'];
      event('risk', `Deleted bot · ${bot.name}`, details);
      return { deleted: bot.id, liquidated: Boolean(order), leftOpen: Boolean(!order && position), order };
    }
    if (input.liquidate === true) {
      const bot = state.bots[input.id];
      if (!bot) throw Error('Bot not found.');
      if (bot.closingOrder) throw Error('Wait for the liquidation order to reconcile.');
      const { order, qty, symbol } = await liquidateBotPosition(bot, { pause: input.pause === true });
      event('risk', `Manual liquidation · ${symbol}`, [`Bot: ${bot.name}`, `Submitted market sell for ${qty} ${symbol}`]);
      return { bot, order };
    }
    if (input.topUp === true) {
      const bot = state.bots[input.id];
      if (!bot) throw Error('Bot not found.');
      const add = Number(input.addFunds);
      if (!Number.isFinite(add) || add < 1 || add > 1e9 || Math.abs(add * 100 - Math.round(add * 100)) > 0.0001) {
        throw Error('Enter an additional amount of at least $1, in dollars and cents.');
      }
      const nextBudget = Number(((bot.budget ?? 0) + add).toFixed(2));
      if (!hasBudget(nextBudget)) throw Error('Total bot budget cannot exceed $1,000,000,000.');
      bot.budget = nextBudget;
      event('fills', 'Added $' + add.toFixed(2) + ' to ' + bot.name + ' budget');
      return bot;
    }
    const source = state.strategies.find(item => item.id === input.id && item.version === input.version);
    if (!source || !['running', 'paused', 'stopped'].includes(input.action)) throw Error('Invalid bot command.');
    if (input.symbol !== undefined && input.symbol !== source.symbol) throw Error('The instrument does not match this strategy version.');
    let s = source;
    if (input.instrument !== undefined) {
      if (input.create !== true || input.action !== 'running') throw Error('Choose a new instrument when launching a bot.');
      if (input.instrument !== source.symbol) {
        const rootId = source.sourceStrategy?.rootId ?? source.id;
        const reused = state.strategies.some(item => item.symbol === input.instrument &&
          (item.sourceStrategy?.rootId ?? item.sourceStrategy?.id ?? item.id) === rootId &&
          state.bots[item.id]?.symbol === input.instrument);
        if (reused) throw Error('A bot already uses this strategy on that instrument. Open its session to resume it.');
        s = {
          ...validateStrategy({ ...source, symbol: input.instrument }), id: randomUUID(), version: 1,
          sourceStrategy: { id: source.id, version: source.version, symbol: source.symbol, rootId }
        };
      }
    }
    const previous = state.bots[s.id];
    if (previous?.closingOrder) throw Error('Wait for the liquidation order to reconcile.');
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
      if (s.ai && !providerFor(s)) throw Error('Configure a Gemini or OpenAI API key in Settings or .env before starting this bot.');
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
    if (s !== source) state.strategies.push(s);
    state.bots[s.id] = {
      id: s.id, version: s.version, name: s.name, symbol: s.symbol, desired: input.action, status: input.action,
      budget, createdAt: previous?.createdAt ?? previous?.started ?? Date.now(), started: Date.now(),
      lastBar: previous?.symbol === s.symbol ? previous.lastBar : undefined,
      lastHoldBar: previous?.symbol === s.symbol ? previous.lastHoldBar : undefined,
      holdBars: previous?.symbol === s.symbol ? previous.holdBars : undefined,
      highWater: previous?.symbol === s.symbol ? previous.highWater : undefined,
      cooldownBars: previous?.symbol === s.symbol ? previous.cooldownBars : undefined,
      lastEvaluation: previous?.version === s.version && previous?.symbol === s.symbol ? previous.lastEvaluation : undefined
    };
    logEntry('bot', input.action === 'running' ? 'good' : 'info', `${s.name} → ${input.action.toUpperCase()}`, { botId: s.id, bot: s.name, symbol: s.symbol, detail: `Strategy v${s.version}${budget ? ' · Budget $' + budget.toFixed(2) : ''}` });
    return state.bots[s.id];
  }
  if (path === '/api/settings') {
    if (input.clearLogs === true) {
      state.logs = [];
      return { cleared: true };
    }
    if (input.testTelegram === true) return telegram.sendTest(mode);
    if (input.removeBotAiKey === true) {
      if (typeof input.botId === 'string' && input.botId) {
        perBotAiProviders.delete(input.botId);
        await saveAiSecrets();
        return { configured: false, botId: input.botId };
      }
      await saveBotAiProvider(null);
      return { configured: false };
    }
    if (input.botAiKey && typeof input.botAiKey === 'object') {
      const name = input.botAiKey.provider === 'OpenAI' ? 'OpenAI' : 'Gemini';
      const key = String(input.botAiKey.key ?? '').trim();
      if (key.length < 10 || key.length > 300) throw Error('Enter a valid Gemini or OpenAI API key.');
      const model = String(input.botAiKey.model ?? '').trim().slice(0, 80) || (name === 'OpenAI' ? 'gpt-4.1-mini' : defaultGeminiModel);
      if (typeof input.botAiKey.botId === 'string' && input.botAiKey.botId) {
        if (!state.bots[input.botAiKey.botId]) throw Error('Bot not found.');
        perBotAiProviders.set(input.botAiKey.botId, { name, key, model });
        await saveAiSecrets();
        return { configured: true, botId: input.botAiKey.botId, provider: name, model, masked: maskKey(key) };
      }
      await saveBotAiProvider({ name, key, model });
      return { configured: true, provider: name, model, masked: maskKey(key) };
    }
    state.alerts = Object.fromEntries(['signals', 'fills', 'risk', 'connections', 'telegram'].map(key => [key, input[key] === true]));
    return state.alerts;
  }
  if (path === '/api/profile') {
    const rawAvatar = typeof input.avatar === 'string' ? input.avatar.trim() : (state.profile?.avatar ?? '');
    const validAvatar = rawAvatar === '' || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(rawAvatar);
    if (!validAvatar || rawAvatar.length > 180000) throw Error('Use a valid PNG, JPEG, or WebP image under 160 KB for the profile photo.');
    const riskTier = ['conservative', 'moderate', 'aggressive'].includes(input.riskTier) ? input.riskTier : (state.profile?.riskTier ?? 'moderate');
    const tradingStyle = ['scalp', 'day', 'swing', 'position'].includes(input.tradingStyle) ? input.tradingStyle : (state.profile?.tradingStyle ?? 'swing');
    state.profile = {
      name: String(input.name || 'Paper Trader').trim().slice(0, 80),
      username: String(input.username || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32),
      email: String(input.email || '').trim().slice(0, 120),
      bio: String(input.bio || '').trim().slice(0, 280),
      avatar: rawAvatar,
      timezone: String(input.timezone || state.profile?.timezone || 'UTC').slice(0, 60),
      riskTier,
      tradingStyle,
      offlineSync: input.offlineSync === true
    };
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
async function previewStrategy(input) {
  const s = validateStrategy(input);
  if (s.mode === 'ai_notepad' || s.mode === 'ai_autonomous') throw Error('Select a rule-based strategy to preview.');
  await loadTimeframe(s);
  const needed = ruleWarmupBars(s);
  const bars = strategyWindow(s, strategyBars(s), needed);
  const ready = bars.length >= needed;
  const groups = {};
  for (const side of ['entry', 'exit']) {
    if (s.rules?.[side]?.length) {
      const group = evaluateRuleSet(bars, s.rules, side);
      groups[side] = { logic: s.rules[side + 'Logic'], ...group, ready: ready && group.ready, pass: ready && group.pass };
    }
  }
  const latest = bars.at(-1);
  const zeroVolume = !isCrypto(s.symbol) && latest?.v === 0;
  return { ready, needed, count: bars.length, latest, groups, zeroVolume, entry: ready && !zeroVolume ? entrySignal(s, bars) : null };
}

function portfolioSettings(input) {
  const strategies = Array.isArray(input.versions) && input.versions.length === 2
    ? input.versions.map(key => state.strategies.find(item => item.id + '@' + item.version === key)) : [];
  const [first, second] = strategies;
  if (!first || !second || first.id === second.id || first.symbol !== second.symbol ||
    (first.timeframe ?? '1Min') !== (second.timeframe ?? '1Min') ||
    strategies.some(item => item.ai || ['ai_notepad', 'ai_autonomous'].includes(item.mode))) {
    throw Error('Choose two distinct rules-only strategies with the same instrument and timeframe.');
  }
  const { capital, split, fees, slippage } = input;
  if (![capital, split, fees, slippage].every(Number.isFinite) || capital < 100 || capital > 1e9 ||
    split < 0.01 || split > 0.99 || Math.min(fees, slippage) < 0 || Math.max(fees, slippage) > 500) {
    throw Error('Enter valid capital, allocation, fees, and slippage.');
  }
  return { strategies, config: { capital, split, fees, slippage } };
}

async function advancePaperPortfolio() {
  const session = state.paperPortfolio;
  if (!session?.running) return;
  const s = session.books[0].s;
  void loadTimeframe(s);
  if (!ready(s.symbol)) return;
  const bars = strategyBars(s);
  const bar = bars.at(-1);
  const duration = demo && session.timeframe === '1Min' ? 0 : timeframes[session.timeframe];
  if (!bar || bar.t === session.lastBar || Date.parse(bar.t) + duration < session.started) return;
  const price = quotePrice(s.symbol, state.bars[s.symbol]?.at(-1));
  if (!Number.isFinite(price) || price <= 0) return;
  stepPaperPortfolio(session, bar, bars, price);
  session.lastBar = bar.t;
}

async function portfolioReplay(input) {
  const { strategies, config } = portfolioSettings(input);
  const [first] = strategies;
  const end = Date.now() - 60000;
  const timeframe = first.timeframe ?? '1Min';
  const bars = closedStrategyBars(await history(first.symbol, end - 14 * 86400000, end, timeframe), timeframe, end);
  if (bars.length <= Math.max(...strategies.map(ruleWarmupBars))) throw Error('Insufficient closed candles for both strategies.');
  return { symbol: first.symbol, timeframe, ...replayPortfolio(strategies, bars, config),
    benchmarks: strategies.map(s => ({ name: s.name, ...replayPortfolio([s], bars, { ...config, split: 1 }) })) };
}

async function backtest(input) {
  const s = state.strategies.find(item => item.id === input.id && item.version === input.version);
  if (!s || s.mode === 'ai_notepad' || s.mode === 'ai_autonomous') throw Error('AI Notepad and Autonomous AI strategies cannot be replayed deterministically. Select a Rule Builder or preset strategy.');
  const { capital, fees, slippage } = input;
  const hasBudget = input.budget !== undefined && input.budget !== null && input.budget !== '';
  const budget = hasBudget ? Number(input.budget) : undefined;
  const start = Date.parse(input.start), end = Math.min(Date.parse(input.end) + 86400000 - 1, Date.now() - 60000);
  if (![capital, fees, slippage, start, end].every(Number.isFinite) || capital < 100 || capital > 1e9 ||
    (hasBudget && (!Number.isFinite(budget) || budget < 1 || budget > 1e9)) ||
    Math.min(fees, slippage) < 0 || Math.max(fees, slippage) > 500 || end <= start || end - start > 31 * 86400000) throw Error('Use a valid date range up to 31 days and valid execution costs.');
  const tf = s.timeframe ?? '1Min';
  const bars = await history(s.symbol, start, end, tf);
  const series = aggregateBars(bars, tf);
  const warmup = ruleWarmupBars(s);
  if (series.length <= warmup) throw Error(`Insufficient ${tf} historical bars (${series.length} loaded, need >${warmup} for warmup). Widen the date range.`);
  const result = replay(s, series, { capital, fees, slippage, budget });
  const storedCurve = downsampleCurve(result.curve, 650);
  const storedTrades = result.trades.slice(-250);
  return serial(async () => {
    const run = {
      id: randomUUID(), t: time(), name: s.name, version: s.version, symbol: s.symbol, timeframe: tf,
      ...(s.playbookId ? { playbookId: s.playbookId } : {}),
      capital, ...(hasBudget ? { budget } : {}), fees, slippage, start: input.start, end: input.end,
      source: sourceFor(s.symbol), final: result.final, drawdown: result.drawdown, metrics: result.metrics,
      tradeCount: result.trades.length, curve: storedCurve, trades: storedTrades
    };
    state.runs.unshift(run);
    state.runs.length = Math.min(12, state.runs.length);
    await persist();
    return { id: run.id };
  });
}
const secHeaders = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const server = createServer(async (req, res) => {
  const respond = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...secHeaders, ...headers }); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return respond(200, { ok: true });
    const port = server.address().port;
    if (bridgeSecret) {
      if (!sameSecret(req.headers['x-fasttrader-worker-secret'], bridgeSecret)) return respond(403, { error: 'Worker authorization required.' });
    } else if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) {
      return respond(403, { error: 'Use the loopback workspace address.' });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      let originOk = true;
      if (req.headers.origin) {
        try { originOk = new URL(req.headers.origin).host === req.headers.host; }
        catch { originOk = false; }
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '') || !originOk) {
        return respond(403, { error: 'Use a same-origin JSON request.' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/auth') return respond(200, auth.status(req.headers.cookie));
    if (req.method === 'POST' && url.pathname === '/api/auth') {
      const clientIp = (bridgeSecret ? req.headers['x-fasttrader-client-ip'] : null) || req.socket?.remoteAddress || 'local';
      const result = await auth.change(await body(req), req.headers.cookie, clientIp);
      return respond(200, result.data, { 'Set-Cookie': result.cookie });
    }
    if (url.pathname.startsWith('/api/') && !auth.authenticated(req.headers.cookie)) return respond(401, { error: 'Sign in to FastTrader.' });
    if (req.method === 'GET' && url.pathname === '/api/state') return respond(200, snapshot());
    if (req.method === 'POST' && url.pathname === '/api/assets') return respond(200, searchAssets(await body(req, 2000)));
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const input = await body(req, ['/api/profile', '/api/knowledge'].includes(url.pathname) ? 220000 : 20000);
      if (url.pathname === '/api/strategy-preview') return respond(200, await previewStrategy(input));
      if (url.pathname === '/api/settings' && input.testBotAiKey === true) {
        return respond(200, await testSavedAiKey(input));
      }
      if (url.pathname === '/api/portfolio-replay') return respond(200, await portfolioReplay(input));
      const idemKey = readIdempotencyKey(req);
      const cacheKey = idemKey ? url.pathname + ':' + idemKey : null;
      if (cacheKey) {
        const cached = getIdempotent(cacheKey);
        if (cached !== undefined) return respond(200, cached);
      }
      const result = url.pathname === '/api/backtest' ? await backtest(input) : await serial(async () => {
        if (!auth.authenticated(req.headers.cookie)) throw Object.assign(Error('Sign in to FastTrader.'), { status: 401 });
        if (cacheKey) {
          const cached = getIdempotent(cacheKey);
          if (cached !== undefined) return cached;
        }
        const value = await change(url.pathname, input);
        await persist();
        if (cacheKey) setIdempotent(cacheKey, value);
        return value;
      });
      if (cacheKey && url.pathname === '/api/backtest') setIdempotent(cacheKey, result);
      return respond(200, result);
    }
    const asset = assets[url.pathname];
    if (req.method !== 'GET' || !asset) return respond(404, { error: 'Not found' });
    const contents = await readFile(new URL('./public/' + asset[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': asset[1].startsWith('image/png') ? asset[1] : asset[1] + '; charset=utf-8', 'Cache-Control': 'no-cache', ...secHeaders });
    res.end(contents);
  } catch (error) {
    const status = error.status >= 400 && error.status < 600 ? error.status : error instanceof SyntaxError ? 400 : 400;
    respond(status, { error: error instanceof SyntaxError ? 'Invalid JSON' : error.message });
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(Number(process.env.PORT || 3000), host, () => console.log('FastTrader ' + mode + ' running at http://' + host + ':' + server.address().port));
