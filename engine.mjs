export const instruments = {
  SPY: ['SPDR S&P 500 ETF', 589.43, 0.84],
  QQQ: ['Invesco QQQ Trust', 514.22, 1.12],
  AAPL: ['Apple Inc.', 228.68, 0.62],
  NVDA: ['NVIDIA Corporation', 142.81, 2.34],
  MSFT: ['Microsoft Corporation', 425.52, -0.32],
  TSLA: ['Tesla, Inc.', 347.91, -1.18],
  'BTC/USD': ['Bitcoin / US Dollar', 96000, 1.40],
  'ETH/USD': ['Ethereum / US Dollar', 3300, 0.95],
  'SOL/USD': ['Solana / US Dollar', 185, 2.05],
  'LTC/USD': ['Litecoin / US Dollar', 97, -0.45]
};

export const isCrypto = symbol => typeof symbol === 'string' && symbol.endsWith('/USD');
export const cryptoReplayRules = { increment: 0.000001, minimum: 0.000001, minValue: 10, tick: 0.01 };

export function roundDown(value, increment) {
  const units = value / increment;
  const steps = Math.floor(units + Math.abs(units) * Number.EPSILON);
  return Number((steps * increment).toFixed(9));
}

function entryQty(budget, price, rules) {
  if (budget <= 0) return 0;
  if (!rules) return Math.floor(budget / price);
  const qty = roundDown(budget / price, rules.increment);
  return qty >= rules.minimum && qty * price >= rules.minValue ? qty : 0;
}

export const timeframes = { '1Min': 60000, '5Min': 300000, '15Min': 900000, '1Hour': 3600000 };
export const strategyModes = ['momentum', 'mean_reversion', 'breakout'];

export const defaults = {
  name: 'Momentum Alpha', symbol: 'SPY', mode: 'momentum', timeframe: '1Min', period: 12, entry: 0.1, exit: -0.1,
  size: 10, exposure: 20, dailyLoss: 3, stop: 2, take: 4, atrStop: 0, cooldown: 5, ai: false
};

export function aggregateBars(bars, timeframe = '1Min') {
  const ms = timeframes[timeframe] ?? 60000;
  if (!Array.isArray(bars) || !bars.length || ms <= 60000) return bars ?? [];
  const out = [];
  for (const bar of bars) {
    const ts = Date.parse(bar.t);
    if (!Number.isFinite(ts)) continue;
    const bucket = Math.floor(ts / ms) * ms;
    const prev = out.at(-1);
    const h = Number.isFinite(bar.h) ? bar.h : Math.max(bar.o, bar.c);
    const l = Number.isFinite(bar.l) ? bar.l : Math.min(bar.o, bar.c);
    if (prev && prev._bucket === bucket) {
      prev.h = Math.max(prev.h, h);
      prev.l = Math.min(prev.l, l);
      prev.c = bar.c;
      prev.v = (prev.v ?? 0) + (bar.v ?? 0);
      prev.t = bar.t;
    } else {
      out.push({ _bucket: bucket, t: bar.t, o: bar.o, h, l, c: bar.c, v: bar.v ?? 0, vw: bar.vw ?? bar.c });
    }
  }
  return out.map(({ _bucket, ...b }) => b);
}

export function computeATR(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const trs = [];
  const slice = bars.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i], prev = slice[i - 1];
    const h = Number.isFinite(cur.h) ? cur.h : Math.max(cur.o, cur.c);
    const l = Number.isFinite(cur.l) ? cur.l : Math.min(cur.o, cur.c);
    trs.push(Math.max(h - l, Math.abs(h - prev.c), Math.abs(l - prev.c)));
  }
  return trs.length ? trs.reduce((sum, v) => sum + v, 0) / trs.length : null;
}

export function computeRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const n = slice.length - 1;
  const avgGain = gains / n, avgLoss = losses / n;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function contiguousBars(bars, period, maxGapMs = 180000) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const slice = [bars.at(-1)];
  for (let i = bars.length - 2; i >= 0 && slice.length < period; i--) {
    const gap = Date.parse(slice[0].t) - Date.parse(bars[i].t);
    if (!Number.isFinite(gap) || gap <= 0 || gap > maxGapMs) break;
    slice.unshift(bars[i]);
  }
  return slice;
}

export function botLedger(orders, symbol, budget) {
  const holdings = new Map();
  let bought = 0, sold = 0, realized = 0, buyFills = 0, sellFills = 0, complete = true;
  const fills = orders.filter(order => order.filled > 0).toSorted((a, b) =>
    Date.parse(a.filledAt ?? a.t) - Date.parse(b.filledAt ?? b.t));
  for (const order of fills) {
    const holding = holdings.get(order.symbol) ?? { qty: 0, cost: 0, boughtQty: 0 };
    holdings.set(order.symbol, holding);
    if (!Number.isFinite(order.price) || order.price <= 0) complete = false;
    const value = (order.price ?? 0) * order.filled;
    if (order.side === 'buy') {
      holding.qty += order.filled;
      holding.boughtQty += order.filled;
      holding.cost += value;
      bought += value;
      buyFills++;
    } else if (order.side === 'sell') {
      if (order.filled - holding.qty > 0.000001) complete = false;
      const cost = holding.qty > 0 ? holding.cost * Math.min(1, order.filled / holding.qty) : 0;
      holding.qty -= order.filled;
      holding.cost = Math.max(0, holding.cost - cost);
      realized += value - cost;
      sold += value;
      sellFills++;
    }
  }
  const { qty, cost, boughtQty } = holdings.get(symbol) ?? { qty: 0, cost: 0, boughtQty: 0 };
  const invested = Array.from(holdings.values()).reduce((sum, holding) => sum + holding.cost, 0);
  const available = complete && Number.isFinite(budget) ? Math.max(0, budget + Math.min(0, realized) - invested) : 0;
  return { qty, cost, boughtQty, invested, bought, sold, realized, buyFills, sellFills, available, complete };
}

export function strategy(input) {
  const result = { name: String(input.name ?? '').trim().slice(0, 60), symbol: input.symbol, ai: input.ai === true };
  if (!result.name || !Object.hasOwn(instruments, result.symbol)) throw Error('Choose a supported asset and strategy name.');
  const bounds = { period: [2, 60], entry: [0, 25], exit: [-25, 0], size: [0.1, 100], exposure: [0.1, 100], dailyLoss: [0.1, 50], stop: [0.1, 50], take: [0.1, 100] };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = input[key];
    if (!Number.isFinite(value) || value < min || value > max) throw Error('Invalid value for ' + key);
    result[key] = value;
  }
  if (!Number.isInteger(result.period) || result.size > result.exposure) throw Error('Use a whole period and size within the exposure limit.');
  const cooldown = input.cooldown === undefined ? 0 : input.cooldown;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 60) throw Error('Invalid value for cooldown');
  result.cooldown = cooldown;
  const mode = input.mode ?? 'momentum';
  if (!strategyModes.includes(mode)) throw Error('Invalid strategy mode.');
  result.mode = mode;
  const timeframe = input.timeframe ?? '1Min';
  if (!Object.hasOwn(timeframes, timeframe)) throw Error('Invalid timeframe.');
  result.timeframe = timeframe;
  const atrStop = input.atrStop === undefined ? 0 : input.atrStop;
  if (!Number.isFinite(atrStop) || atrStop < 0 || atrStop > 10) throw Error('Invalid value for atrStop');
  result.atrStop = atrStop;
  return result;
}

export function decision(s, closes, account, position, price, rules = isCrypto(s.symbol) ? cryptoReplayRules : null, options = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const mode = s.mode ?? 'momentum';
  const warmedUp = options.warmedUp !== false && closes.length >= s.period;
  const pnl = position?.qty > 0 ? 100 * (price / position.entry - 1) : 0;
  const limit = account.equity <= account.dayStart * (1 - s.dailyLoss / 100);
  const effectiveStop = position?.qty > 0 && s.atrStop > 0 && Number.isFinite(options.atr) && options.atr > 0
    ? Math.min(s.stop, 100 * (s.atrStop * options.atr) / position.entry)
    : s.stop;
  if (position?.qty > 0) {
    const protective = limit || pnl <= -effectiveStop || pnl >= s.take;
    if (protective) {
      return { side: 'sell', qty: position.qty, protective: true, stopLoss: !limit && pnl <= -effectiveStop,
        rationale: limit ? 'Maximum daily loss reached' : pnl <= -effectiveStop ? (s.atrStop > 0 ? `ATR stop-loss reached (-${effectiveStop.toFixed(2)}%)` : 'Stop-loss reached') : 'Take-profit reached' };
    }
    if (!warmedUp) return null;
    const window = closes.slice(-s.period);
    const average = window.reduce((sum, value) => sum + value, 0) / window.length;
    const latestClose = closes.at(-1);
    if (mode === 'mean_reversion') {
      const rsi = computeRSI(closes, Math.min(14, s.period));
      if (latestClose >= average || (rsi !== null && rsi >= 65)) {
        return { side: 'sell', qty: position.qty, protective: false, rationale: rsi !== null && rsi >= 65 ? `Mean reversion exit (RSI ${rsi.toFixed(1)})` : 'Price reverted to its moving average' };
      }
      return null;
    }
    if (mode === 'breakout') {
      const prior = window.slice(0, -1);
      const channelLow = prior.length ? Math.min(...prior) : average;
      if (latestClose < channelLow) {
        return { side: 'sell', qty: position.qty, protective: false, rationale: 'Price broke below the Donchian channel low' };
      }
      return null;
    }
    const momentum = 100 * (latestClose / average - 1);
    if (momentum < s.exit) {
      return { side: 'sell', qty: position.qty, protective: false, rationale: 'Price fell below the exit threshold' };
    }
    return null;
  }
  if (!warmedUp || limit || options.cooldown > 0 || (!rules && options.volume === 0)) return null;
  const window = closes.slice(-s.period);
  const average = window.reduce((sum, value) => sum + value, 0) / window.length;
  const latestClose = closes.at(-1);
  let rationale = null;
  if (mode === 'mean_reversion') {
    const variance = window.reduce((sum, v) => sum + (v - average) ** 2, 0) / window.length;
    const std = Math.sqrt(variance);
    const z = std > 0 ? (latestClose - average) / std : 0;
    const threshold = Math.max(0.5, s.entry || 1.5);
    const rsi = computeRSI(closes, Math.min(14, s.period));
    if (z <= -threshold && (rsi === null || rsi <= 40)) {
      rationale = `Mean reversion dip (Z ${z.toFixed(2)}, RSI ${(rsi ?? 0).toFixed(0)})`;
    }
  } else if (mode === 'breakout') {
    const prior = window.slice(0, -1);
    const channelHigh = prior.length ? Math.max(...prior) : average;
    const breakoutPct = 100 * (latestClose / channelHigh - 1);
    if (breakoutPct > s.entry) {
      rationale = `Donchian breakout +${breakoutPct.toFixed(2)}% above ${s.period}-bar high`;
    }
  } else {
    const momentum = 100 * (latestClose / average - 1);
    if (momentum > s.entry) {
      rationale = 'Price is ' + momentum.toFixed(2) + '% above its moving average';
    }
  }
  if (!rationale) return null;
  const budget = Math.min(account.equity * s.size / 100, account.equity * s.exposure / 100 - account.exposure, account.cash);
  const qty = entryQty(budget, price, rules);
  return qty > 0 ? { side: 'buy', qty, rationale } : null;
}

export function replay(s, bars, options) {
  let cash = options.capital, dayStart = cash, peak = cash, day, position, pending, cooldown = 0;
  const curve = [], trades = [];
  const historyBars = [];
  const rules = isCrypto(s.symbol) ? cryptoReplayRules : null;
  const budgetCap = Number.isFinite(options.budget) && options.budget > 0 ? options.budget : Infinity;
  const tfMs = timeframes[s.timeframe ?? '1Min'] ?? 60000;
  const maxGapMs = options.maxGapMs ?? Math.max(180000, tfMs * 3);
  const series = aggregateBars(bars, s.timeframe ?? '1Min');
  for (const bar of series) {
    const date = bar.t.slice(0, 10);
    if (date !== day) {
      day = date;
      dayStart = curve.at(-1)?.value ?? cash;
    }
    if (pending) {
      const buy = pending.side === 'buy';
      const price = bar.o * (1 + (buy ? 1 : -1) * options.slippage / 10000);
      const unitCost = price * (1 + options.fees / 10000);
      const equity = cash + (position?.qty ?? 0) * bar.o;
      const qty = buy ? equity <= dayStart * (1 - s.dailyLoss / 100) ? 0 :
        Math.min(pending.qty, entryQty(Math.min(cash, budgetCap, equity * s.exposure / 100, equity * s.size / 100), unitCost, rules)) : position.qty;
      if (qty > 0 && (!buy || !rules || qty * price >= rules.minValue)) {
        const fee = qty * price * options.fees / 10000;
        const pnl = buy ? null : qty * (price - position.entry) - fee - position.fee;
        cash += (buy ? -1 : 1) * qty * price - fee;
        position = buy ? { qty, entry: price, fee } : null;
        if (!buy && pending.stopLoss) cooldown = s.cooldown ?? 0;
        trades.push({ t: bar.t, side: pending.side, qty, price, fee, pnl });
      }
      pending = null;
    }
    if (position && Number.isFinite(bar.l) && Number.isFinite(bar.h) && bar.l > 0 && bar.h >= bar.l) {
      const atr = s.atrStop > 0 ? computeATR(historyBars, Math.min(14, s.period)) : null;
      const stopPct = s.atrStop > 0 && atr > 0 ? Math.min(s.stop, 100 * (s.atrStop * atr) / position.entry) : s.stop;
      const stopPrice = position.entry * (1 - stopPct / 100);
      const takePrice = position.entry * (1 + s.take / 100);
      const stopped = bar.l <= stopPrice;
      const trigger = stopped ? Math.min(bar.o, stopPrice) : bar.h >= takePrice ? Math.max(bar.o, takePrice) : null;
      if (trigger !== null) {
        const price = trigger * (1 - options.slippage / 10000);
        const qty = position.qty;
        const fee = qty * price * options.fees / 10000;
        const pnl = qty * (price - position.entry) - fee - position.fee;
        cash += qty * price - fee;
        position = null;
        if (stopped) cooldown = s.cooldown ?? 0;
        trades.push({ t: bar.t, side: 'sell', qty, price, fee, pnl });
      }
    }
    const exposure = (position?.qty ?? 0) * bar.c;
    const equity = cash + exposure;
    peak = Math.max(peak, equity);
    curve.push({ t: bar.t, value: equity, drawdown: 100 * (equity / peak - 1) });
    historyBars.push(bar);
    const window = contiguousBars(historyBars, s.period, maxGapMs);
    const atr = s.atrStop > 0 ? computeATR(window, Math.min(14, s.period)) : null;
    pending = decision(s, window.map(b => b.c), { equity, cash: Math.min(cash, budgetCap), dayStart, exposure }, position, bar.c, rules, {
      warmedUp: window.length >= s.period,
      cooldown,
      atr,
      volume: Number.isFinite(bar.v) ? bar.v : undefined
    });
    if (cooldown > 0) cooldown--;
  }
  return { curve, trades, final: curve.at(-1)?.value ?? cash, drawdown: Math.min(0, ...curve.map(p => p.drawdown)) };
}

export function synthetic(symbol, start, end, interval = 3600000) {
  const [,, change] = instruments[symbol];
  const base = instruments[symbol][1];
  const result = [];
  for (let time = Math.ceil(start / interval) * interval; time <= end; time += interval) {
    const i = time / interval;
    const price = j => base * (1 + 0.016 * Math.sin(j / 9) + 0.009 * Math.cos(j / 3.2) + 0.003 * Math.sin(j * 1.9) + change * 0.002);
    result.push({ t: new Date(time).toISOString(), o: price(i - 1), c: price(i), v: Math.round(80000 + 25000 * Math.sin(i)) });
  }
  return result;
}
