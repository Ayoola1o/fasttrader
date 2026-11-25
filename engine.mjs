import { strategyPlaybooks } from './public/strategy-playbooks.mjs';

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

export const timeframes = { '1Min': 60000, '5Min': 300000, '15Min': 900000, '1Hour': 3600000, '4Hour': 14400000, '1Day': 86400000 };
export const strategyModes = ['momentum', 'mean_reversion', 'breakout', 'custom', 'ai_notepad', 'ai_autonomous'];
export const candleIndicators = [
  'bullish_pin_bar', 'bearish_pin_bar',
  'bullish_engulfing', 'bearish_engulfing',
  'inside_bar_breakout', 'inside_bar_fakey',
  'morning_star', 'evening_star',
  'tweezer_bottom', 'tweezer_top'
];
export const ruleIndicators = [
  'close', 'sma', 'ema', 'rsi', 'adx', 'vwap', 'bb_upper', 'bb_lower', 'bb_width',
  'keltner_upper', 'keltner_lower', 'macd', 'macd_signal', 'donchian_high', 'donchian_low',
  'fib_retracement', 'sr_room_ratio', ...candleIndicators,
  'atr', 'volume', 'avg_volume', 'rvol', 'pct_change', 'number'
];
export const ruleOperators = ['gt', 'lt', 'gte', 'lte', 'eq', 'crosses_above', 'crosses_below'];

export const defaults = {
  name: 'Momentum Alpha', symbol: 'SPY', mode: 'momentum', timeframe: '1Min', period: 12, entry: 0.1, exit: -0.1,
  sizeMode: 'percent', size: 10, sizeUsd: 500, riskPct: 1, candleStop: false, exposure: 20, dailyLoss: 3, stop: 2, take: 4, trailingStop: 0,
  atrStop: 0, cooldown: 5, maxHoldBars: 0, htfEma: 0, minAdx: 0, ai: false, aiPrompt: '', aiNotes: '',
  aiWakeMode: 'smart', aiRiskProfile: 'balanced', aiSizing: 'dynamic', aiDailyCap: 100, rules: null
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

export function closedStrategyBars(bars, timeframe, now, demo = false) {
  const duration = timeframes[timeframe] ?? 60000;
  if (demo && duration === 60000) return bars;
  return aggregateBars(bars, timeframe).filter(bar =>
    (Math.floor(Date.parse(bar.t) / duration) + 1) * duration <= now
  ).map(bar => duration === 60000 ? bar : {
    ...bar, t: new Date(Math.floor(Date.parse(bar.t) / duration) * duration).toISOString()
  });
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
  const slice = closes.slice(-Math.max(period + 1, period * 6 + 1));
  const seedLen = Math.min(period, slice.length - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i <= seedLen; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / seedLen, avgLoss = losses / seedLen;
  for (let i = seedLen + 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function computeADX(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length <= period) return null;
  const slice = bars.slice(-Math.max(period * 3 + 1, period + 2));
  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i], prev = slice[i - 1];
    const h = Number.isFinite(cur.h) ? cur.h : Math.max(cur.o, cur.c);
    const l = Number.isFinite(cur.l) ? cur.l : Math.min(cur.o, cur.c);
    const ph = Number.isFinite(prev.h) ? prev.h : Math.max(prev.o, prev.c);
    const pl = Number.isFinite(prev.l) ? prev.l : Math.min(prev.o, prev.c);
    const up = h - ph, down = pl - l;
    pdm.push(up > down && up > 0 ? up : 0);
    mdm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(h - l, Math.abs(h - prev.c), Math.abs(l - prev.c)));
  }
  if (tr.length < period) return null;
  let sTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sPdm = pdm.slice(0, period).reduce((a, b) => a + b, 0);
  let sMdm = mdm.slice(0, period).reduce((a, b) => a + b, 0);
  const dxList = [];
  const pushDx = () => {
    if (sTr <= 0) { dxList.push(0); return; }
    const pdi = 100 * (sPdm / sTr), mdi = 100 * (sMdm / sTr);
    const denom = pdi + mdi;
    dxList.push(denom > 0 ? 100 * Math.abs(pdi - mdi) / denom : 0);
  };
  pushDx();
  for (let i = period; i < tr.length; i++) {
    sTr = sTr - sTr / period + tr[i];
    sPdm = sPdm - sPdm / period + pdm[i];
    sMdm = sMdm - sMdm / period + mdm[i];
    pushDx();
  }
  if (dxList.length < period) return dxList.reduce((a, b) => a + b, 0) / dxList.length;
  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) adx = (adx * (period - 1) + dxList[i]) / period;
  return adx;
}

export function computeVWAP(bars) {
  if (!Array.isArray(bars) || !bars.length) return null;
  const sessionDay = String(bars.at(-1).t ?? '').slice(0, 10);
  let pv = 0, vol = 0, sumPrice = 0, count = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (sessionDay && String(b.t ?? '').slice(0, 10) !== sessionDay && count >= 5) break;
    const h = Number.isFinite(b.h) ? b.h : Math.max(b.o, b.c);
    const l = Number.isFinite(b.l) ? b.l : Math.min(b.o, b.c);
    const typical = Number.isFinite(b.vw) && b.vw > 0 ? b.vw : (h + l + b.c) / 3;
    const v = Number.isFinite(b.v) && b.v > 0 ? b.v : 0;
    pv += typical * v;
    vol += v;
    sumPrice += typical;
    count++;
  }
  return vol > 0 ? pv / vol : (count > 0 ? sumPrice / count : null);
}

export function computeEMA(values, period) {
  if (!Array.isArray(values) || values.length < period || period < 1) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

export function computeMACD(closes) {
  if (!Array.isArray(closes) || closes.length < 35) return null;
  const series = [];
  for (let i = 26; i <= closes.length; i++) {
    const sub = closes.slice(0, i);
    const fast = computeEMA(sub, 12);
    const slow = computeEMA(sub, 26);
    if (fast !== null && slow !== null) series.push(fast - slow);
  }
  if (series.length < 9) return null;
  const macd = series.at(-1);
  const signal = computeEMA(series, 9);
  return { macd, signal };
}

function barOHLC(b) {
  const o = b.o, c = b.c;
  const h = Number.isFinite(b.h) ? b.h : Math.max(o, c);
  const l = Number.isFinite(b.l) ? b.l : Math.min(o, c);
  return { o, h, l, c, range: Math.max(0, h - l), body: Math.abs(c - o) };
}

export function detectCandlestickPatterns(bars) {
  const emptyFlags = Object.fromEntries(candleIndicators.map(k => [k, 0]));
  if (!Array.isArray(bars) || !bars.length) {
    return { active: [], flags: emptyFlags, setupLow: null, atr: null, anatomy: null };
  }
  const cur = barOHLC(bars.at(-1));
  const prev = bars.length >= 2 ? barOHLC(bars.at(-2)) : null;
  const prev2 = bars.length >= 3 ? barOHLC(bars.at(-3)) : null;
  const atr = computeATR(bars, 14) ?? (cur.range > 0 ? cur.range : cur.c * 0.002);
  const minRange = atr > 0 ? 0.5 * atr : 0;
  const lowerTail = Math.min(cur.o, cur.c) - cur.l;
  const upperTail = cur.h - Math.max(cur.o, cur.c);

  const flags = { ...emptyFlags };
  if (cur.range > 0 && cur.range >= minRange) {
    if (lowerTail >= 0.6 * cur.range && lowerTail >= 2 * Math.max(cur.body, cur.range * 0.05) && upperTail <= 0.25 * cur.range) {
      flags.bullish_pin_bar = 1;
    }
    if (upperTail >= 0.6 * cur.range && upperTail >= 2 * Math.max(cur.body, cur.range * 0.05) && lowerTail <= 0.25 * cur.range) {
      flags.bearish_pin_bar = 1;
    }
  }
  if (prev) {
    const minBody = atr > 0 ? 0.35 * atr : 0;
    if (prev.c < prev.o && cur.c > cur.o && cur.body > prev.body && cur.body >= minBody && cur.c >= prev.o && cur.o <= prev.c) {
      flags.bullish_engulfing = 1;
    }
    if (prev.c > prev.o && cur.c < cur.o && cur.body > prev.body && cur.body >= minBody && cur.o >= prev.c && cur.c <= prev.o) {
      flags.bearish_engulfing = 1;
    }
    const tol = Math.max(0.15 * atr, cur.c * 0.0005);
    if (prev.c < prev.o && cur.c > cur.o && Math.abs(cur.l - prev.l) <= tol && cur.c >= (prev.o + prev.c) / 2) {
      flags.tweezer_bottom = 1;
    }
    if (prev.c > prev.o && cur.c < cur.o && Math.abs(cur.h - prev.h) <= tol && cur.c <= (prev.o + prev.c) / 2) {
      flags.tweezer_top = 1;
    }
  }
  if (prev && prev2 && prev2.range > 0) {
    const isInside = prev.h <= prev2.h && prev.l >= prev2.l;
    if (isInside && cur.c > prev2.h && cur.c > cur.o) {
      flags.inside_bar_breakout = 1;
    }
    if (isInside && cur.l < prev.l && cur.c > prev.l && (cur.c >= cur.o || lowerTail >= 0.5 * cur.range)) {
      flags.inside_bar_fakey = 1;
    }
    if (prev2.c < prev2.o && prev2.body >= 0.5 * prev2.range && prev.body <= 0.45 * prev2.body &&
      Math.max(prev.o, prev.c) <= prev2.o && cur.c > cur.o && cur.c >= (prev2.o + prev2.c) / 2) {
      flags.morning_star = 1;
    }
    if (prev2.c > prev2.o && prev2.body >= 0.5 * prev2.range && prev.body <= 0.45 * prev2.body &&
      Math.min(prev.o, prev.c) >= prev2.o && cur.c < cur.o && cur.c <= (prev2.o + prev2.c) / 2) {
      flags.evening_star = 1;
    }
  }

  let setupLow = cur.l;
  if (flags.inside_bar_breakout || flags.inside_bar_fakey || flags.morning_star) {
    setupLow = Math.min(cur.l, prev.l, prev2.l);
  } else if (flags.bullish_engulfing || flags.tweezer_bottom) {
    setupLow = Math.min(cur.l, prev.l);
  }
  const active = candleIndicators.filter(k => flags[k] === 1);
  const anatomy = cur.range > 0 ? {
    direction: cur.c > cur.o ? 'bullish' : cur.c < cur.o ? 'bearish' : 'doji',
    bodyPct: Number((100 * cur.body / cur.range).toFixed(1)),
    upperWickPct: Number((100 * upperTail / cur.range).toFixed(1)),
    lowerWickPct: Number((100 * lowerTail / cur.range).toFixed(1))
  } : { direction: 'doji', bodyPct: 0, upperWickPct: 0, lowerWickPct: 0 };
  return { active, flags, setupLow, atr, anatomy };
}

export function indicatorValue(bars, spec, offset = 0) {
  if (!spec || !bars?.length) return null;
  if (spec.indicator === 'number') return Number.isFinite(spec.value) ? spec.value : null;
  const end = bars.length - offset;
  if (end <= 0) return null;
  const slice = bars.slice(0, end);
  if (candleIndicators.includes(spec.indicator)) {
    return detectCandlestickPatterns(slice).flags[spec.indicator] ?? 0;
  }
  const closes = slice.map(b => b.c);
  const period = Math.max(1, Math.min(200, Math.round(spec.period ?? 14)));
  const last = slice.at(-1);
  switch (spec.indicator) {
    case 'close': return last.c;
    case 'volume': return last.v ?? 0;
    case 'sma': {
      if (closes.length < period) return null;
      const w = closes.slice(-period);
      return w.reduce((s, v) => s + v, 0) / period;
    }
    case 'ema': return computeEMA(closes, period);
    case 'rsi': return closes.length > period ? computeRSI(closes, period) : null;
    case 'adx': return slice.length > period ? computeADX(slice, period) : null;
    case 'vwap': return computeVWAP(slice);
    case 'bb_upper':
    case 'bb_lower':
    case 'bb_width': {
      if (closes.length < period) return null;
      const w = closes.slice(-period);
      const mean = w.reduce((s, v) => s + v, 0) / period;
      const std = Math.sqrt(w.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      const mult = Number.isFinite(spec.mult) && spec.mult > 0 ? spec.mult : 2;
      if (spec.indicator === 'bb_width') return mean > 0 ? 100 * (2 * mult * std) / mean : null;
      return spec.indicator === 'bb_upper' ? mean + mult * std : mean - mult * std;
    }
    case 'keltner_upper':
    case 'keltner_lower': {
      if (slice.length <= period) return null;
      const mid = computeEMA(closes, period);
      const atr = computeATR(slice, period);
      if (mid === null || atr === null) return null;
      const mult = Number.isFinite(spec.mult) && spec.mult > 0 ? spec.mult : 1.5;
      return spec.indicator === 'keltner_upper' ? mid + mult * atr : mid - mult * atr;
    }
    case 'macd': return computeMACD(closes)?.macd ?? null;
    case 'macd_signal': return computeMACD(closes)?.signal ?? null;
    case 'donchian_high':
    case 'donchian_low': {
      if (slice.length <= period) return null;
      const prior = slice.slice(-(period + 1), -1);
      return spec.indicator === 'donchian_high'
        ? Math.max(...prior.map(b => Number.isFinite(b.h) ? b.h : Math.max(b.o, b.c)))
        : Math.min(...prior.map(b => Number.isFinite(b.l) ? b.l : Math.min(b.o, b.c)));
    }
    case 'fib_retracement': {
      if (slice.length < period) return null;
      const w = slice.slice(-period);
      let swingLow = Infinity, swingHigh = -Infinity, lowIdx = 0, highIdx = 0;
      for (let i = 0; i < w.length; i++) {
        const { h, l } = barOHLC(w[i]);
        if (l < swingLow) { swingLow = l; lowIdx = i; }
        if (h >= swingHigh) { swingHigh = h; highIdx = i; }
      }
      const span = swingHigh - swingLow;
      if (span <= 0) return 50;
      if (highIdx <= lowIdx) return -1;
      return 100 * (swingHigh - last.c) / span;
    }
    case 'sr_room_ratio': {
      if (slice.length < period) return null;
      const w = slice.slice(-period);
      let resHigh = -Infinity, supLow = Infinity;
      for (const b of w) {
        const { h, l } = barOHLC(b);
        if (h > resHigh) resHigh = h;
        if (l < supLow) supLow = l;
      }
      const atr = computeATR(slice, Math.min(14, Math.max(2, slice.length - 1))) ?? Math.max(1e-6, (resHigh - supLow) / 10);
      const upside = Math.max(0, resHigh - last.c);
      const downside = Math.max(0.25 * (atr || 1e-6), last.c - supLow);
      return upside / downside;
    }
    case 'atr': return slice.length > period ? computeATR(slice, period) : null;
    case 'avg_volume':
    case 'rvol': {
      if (slice.length < period) return null;
      const w = slice.slice(-period).map(b => b.v ?? 0);
      const avg = w.reduce((s, v) => s + v, 0) / period;
      if (spec.indicator === 'rvol') return avg > 0 ? (last.v ?? 0) / avg : 1;
      return avg;
    }
    case 'pct_change': {
      if (closes.length <= period) return null;
      const prev = closes[closes.length - 1 - period];
      return prev > 0 ? 100 * (last.c / prev - 1) : null;
    }
    default: return null;
  }
}

export function evaluateRule(bars, rule) {
  const leftVal = indicatorValue(bars, rule.left, 0);
  const rightVal = indicatorValue(bars, rule.right, 0);
  if (!Number.isFinite(leftVal) || !Number.isFinite(rightVal)) return { ready: false, pass: false, leftVal, rightVal };
  if (rule.op === 'crosses_above' || rule.op === 'crosses_below') {
    const prevLeft = indicatorValue(bars, rule.left, 1);
    const prevRight = indicatorValue(bars, rule.right, 1);
    if (!Number.isFinite(prevLeft) || !Number.isFinite(prevRight)) return { ready: false, pass: false, leftVal, rightVal };
    const pass = rule.op === 'crosses_above' ? prevLeft <= prevRight && leftVal > rightVal : prevLeft >= prevRight && leftVal < rightVal;
    return { ready: true, pass, leftVal, rightVal };
  }
  const pass = rule.op === 'eq'
    ? Math.abs(leftVal - rightVal) < 1e-9
    : rule.op === 'gt' ? leftVal > rightVal : rule.op === 'lt' ? leftVal < rightVal : rule.op === 'gte' ? leftVal >= rightVal : leftVal <= rightVal;
  return { ready: true, pass, leftVal, rightVal };
}

export function evaluateRuleSet(bars, rules, side) {
  const list = rules?.[side] ?? [];
  if (!list.length) return { ready: true, pass: false, results: [] };
  const logic = (side === 'entry' ? rules.entryLogic : rules.exitLogic) === 'any' ? 'any' : 'all';
  const results = list.map(rule => ({ rule, ...evaluateRule(bars, rule) }));
  const ready = results.every(r => r.ready);
  const pass = ready && (logic === 'all' ? results.every(r => r.pass) : results.some(r => r.pass));
  return { ready, pass, results };
}

export function ruleWarmupBars(s) {
  const all = [...(s.rules?.entry ?? []), ...(s.rules?.exit ?? [])];
  let max = s.mode === 'custom' && all.length ? 2 : (s.period ?? 12);
  if (s.mode === 'breakout') max++;
  if (s.atrStop > 0 || s.candleStop) max = Math.max(max, Math.min(14, s.period ?? 14) + 1);
  if (s.minAdx > 0) max = Math.max(max, 16);
  for (const r of all) {
    for (const side of [r.left, r.right]) {
      if (!side) continue;
      if (side.indicator === 'macd' || side.indicator === 'macd_signal') max = Math.max(max, 36);
      else if (candleIndicators.includes(side.indicator)) max = Math.max(max, 15);
      else if (side.indicator === 'adx') max = Math.max(max, (side.period ?? 14) + 2);
      else if (!['number', 'close', 'volume', 'vwap'].includes(side.indicator)) {
        max = Math.max(max, (side.period ?? 14) + 2);
      }
    }
  }
  return max;
}

export function contiguousBars(bars, period, maxGapMs = 180000, allowGap = () => false) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const slice = [bars.at(-1)];
  for (let i = bars.length - 2; i >= 0 && slice.length < period; i--) {
    const gap = Date.parse(slice[0].t) - Date.parse(bars[i].t);
    if (!Number.isFinite(gap) || gap <= 0 || (gap > maxGapMs && !allowGap(bars[i], slice[0], gap))) break;
    slice.unshift(bars[i]);
  }
  return slice;
}

const equitySessionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

export function strategyWindow(s, bars, length = ruleWarmupBars(s), maxGapMs) {
  const duration = timeframes[s.timeframe ?? '1Min'];
  const maxClosureDays = duration >= 14400000 ? 5 : 4;
  const allowEquityClosure = (previous, next, gap) => !isCrypto(s.symbol) &&
    gap >= 8 * 3600000 && gap <= maxClosureDays * 86400000 &&
    equitySessionDate.format(new Date(previous.t)) !== equitySessionDate.format(new Date(next.t));
  return contiguousBars(bars, length, maxGapMs ?? Math.max(180000, duration * 3), allowEquityClosure);
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
  const available = complete && Number.isFinite(budget) ? remainingBudget(budget, realized, invested) : 0;
  return { qty, cost, boughtQty, invested, bought, sold, realized, buyFills, sellFills, available, complete };
}

function remainingBudget(budget, realized, invested = 0) {
  return Math.max(0, budget + Math.min(0, realized) - invested);
}

const periodFreeIndicators = new Set(['close', 'volume', 'macd', 'macd_signal', 'vwap', ...candleIndicators]);

function sanitizeRuleSpec(spec) {
  if (!spec || typeof spec !== 'object' || !ruleIndicators.includes(spec.indicator)) throw Error('Invalid rule indicator.');
  if (spec.indicator === 'number') {
    if (!Number.isFinite(spec.value) || Math.abs(spec.value) > 1e9) throw Error('Invalid rule number value.');
    return { indicator: 'number', value: spec.value };
  }
  const out = { indicator: spec.indicator };
  if (!periodFreeIndicators.has(spec.indicator)) {
    const p = spec.period ?? 14;
    if (!Number.isInteger(p) || p < 1 || p > 200) throw Error('Rule indicator period must be between 1 and 200.');
    out.period = p;
  }
  return out;
}

function sanitizeRules(rules) {
  if (!rules) return null;
  const parseList = list => {
    if (!Array.isArray(list) || list.length > 8) throw Error('Use up to 8 conditions per rule group.');
    return list.map(r => {
      if (!r || !ruleOperators.includes(r.op)) throw Error('Invalid rule operator.');
      return { left: sanitizeRuleSpec(r.left), op: r.op, right: sanitizeRuleSpec(r.right) };
    });
  };
  const entry = parseList(rules.entry ?? []);
  const exit = parseList(rules.exit ?? []);
  return {
    entryLogic: rules.entryLogic === 'any' ? 'any' : 'all',
    exitLogic: rules.exitLogic === 'all' ? 'all' : 'any',
    entry, exit
  };
}

export function strategy(input, supportsSymbol = symbol => Object.hasOwn(instruments, symbol)) {
  const result = { name: String(input.name ?? '').trim().slice(0, 60), symbol: input.symbol, ai: input.ai === true };
  if (!result.name || !supportsSymbol(result.symbol)) throw Error('Choose a supported asset and strategy name.');
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
  const trailingStop = input.trailingStop === undefined ? 0 : input.trailingStop;
  if (!Number.isFinite(trailingStop) || trailingStop < 0 || trailingStop > 50) throw Error('Invalid value for trailingStop');
  result.trailingStop = trailingStop;
  const maxHoldBars = input.maxHoldBars === undefined ? 0 : input.maxHoldBars;
  if (!Number.isInteger(maxHoldBars) || maxHoldBars < 0 || maxHoldBars > 1440) throw Error('Invalid value for maxHoldBars');
  result.maxHoldBars = maxHoldBars;
  const htfEma = input.htfEma === undefined ? 0 : input.htfEma;
  if (!Number.isInteger(htfEma) || htfEma < 0 || htfEma > 200) throw Error('Invalid value for htfEma');
  result.htfEma = htfEma;
  const minAdx = input.minAdx === undefined ? 0 : input.minAdx;
  if (!Number.isInteger(minAdx) || minAdx < 0 || minAdx > 60) throw Error('Invalid value for minAdx');
  result.minAdx = minAdx;
  const sizeMode = ['percent', 'usd', 'risk'].includes(input.sizeMode) ? input.sizeMode : 'percent';
  result.sizeMode = sizeMode;
  const sizeUsd = input.sizeUsd === undefined ? 500 : input.sizeUsd;
  if (!Number.isFinite(sizeUsd) || sizeUsd < 1 || sizeUsd > 1e9) throw Error('Invalid value for sizeUsd');
  result.sizeUsd = sizeUsd;
  const riskPct = input.riskPct === undefined ? 1 : input.riskPct;
  if (!Number.isFinite(riskPct) || riskPct < 0.1 || riskPct > 10) throw Error('Invalid value for riskPct');
  result.riskPct = riskPct;
  result.candleStop = input.candleStop === true;
  result.aiPrompt = typeof input.aiPrompt === 'string' ? input.aiPrompt.trim().slice(0, 300) : '';
  result.aiNotes = typeof input.aiNotes === 'string' ? input.aiNotes.trim().slice(0, 4000) : '';
  result.aiWakeMode = input.aiWakeMode === 'fixed' ? 'fixed' : 'smart';
  result.aiRiskProfile = ['conservative', 'balanced', 'aggressive'].includes(input.aiRiskProfile) ? input.aiRiskProfile : 'balanced';
  result.aiSizing = input.aiSizing === 'simple' ? 'simple' : 'dynamic';
  const aiDailyCap = input.aiDailyCap === undefined ? 100 : input.aiDailyCap;
  if (!Number.isInteger(aiDailyCap) || aiDailyCap < 0 || aiDailyCap > 500) throw Error('Daily AI call cap must be a whole number between 0 and 500.');
  result.aiDailyCap = aiDailyCap;
  if (input.knowledgeIds !== undefined && (!Array.isArray(input.knowledgeIds) || input.knowledgeIds.length > 3 ||
    !input.knowledgeIds.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)))) {
    throw Error('Select up to three uploaded strategy documents.');
  }
  if (result.mode === 'ai_notepad' || result.mode === 'ai_autonomous') {
    result.knowledgeIds = [...new Set(input.knowledgeIds ?? [])];
  }
  if (Object.hasOwn(strategyPlaybooks, input.playbookId)) result.playbookId = input.playbookId;
  result.rules = sanitizeRules(input.rules);
  if (result.mode === 'custom' && (!result.rules || !result.rules.entry.length)) throw Error('Add at least one entry rule for a custom strategy.');
  if (result.mode === 'ai_notepad') {
    if (result.aiNotes.length < 10 && !result.knowledgeIds.length) throw Error('Write at least 10 characters in AI Notepad or select an uploaded strategy document.');
    result.ai = true;
  }
  if (result.mode === 'ai_autonomous') {
    result.ai = true;
  }
  return result;
}

export function classifyRegime(bars) {
  if (!Array.isArray(bars) || bars.length < 5) {
    return { regime: 'NEUTRAL', adx: null, rsi: null, rvol: null, vwap: null, squeeze: false };
  }
  const closes = bars.map(b => b.c);
  const last = closes.at(-1);
  const adx = computeADX(bars, 14);
  const rsi = computeRSI(closes, 14);
  const vwap = computeVWAP(bars);
  const rvol = indicatorValue(bars, { indicator: 'rvol', period: Math.min(20, bars.length) });
  const ema20 = computeEMA(closes, Math.min(20, closes.length));
  const ema50 = closes.length >= 50 ? computeEMA(closes, 50) : ema20;
  const bbu = indicatorValue(bars, { indicator: 'bb_upper', period: 20 });
  const bbl = indicatorValue(bars, { indicator: 'bb_lower', period: 20 });
  const kcu = indicatorValue(bars, { indicator: 'keltner_upper', period: 20 });
  const kcl = indicatorValue(bars, { indicator: 'keltner_lower', period: 20 });
  const squeezeNow = bbu !== null && kcu !== null && bbu < kcu && bbl > kcl;
  const prevBbu = indicatorValue(bars, { indicator: 'bb_upper', period: 20 }, 1);
  const prevBbl = indicatorValue(bars, { indicator: 'bb_lower', period: 20 }, 1);
  const prevKcu = indicatorValue(bars, { indicator: 'keltner_upper', period: 20 }, 1);
  const prevKcl = indicatorValue(bars, { indicator: 'keltner_lower', period: 20 }, 1);
  const squeezePrev = prevBbu !== null && prevKcu !== null && prevBbu < prevKcu && prevBbl > prevKcl;
  let regime = 'NEUTRAL';
  if (squeezePrev && !squeezeNow && bbu !== null && last > bbu) regime = 'SQUEEZE_BREAKOUT';
  else if (squeezeNow) regime = 'VOLATILITY_SQUEEZE';
  else if (adx !== null && adx < 20) regime = 'RANGE_CHOP';
  else if (adx !== null && adx >= 22) regime = last >= (ema50 ?? ema20 ?? last) ? 'TRENDING_BULL' : 'TRENDING_BEAR';
  return {
    regime,
    adx: adx !== null ? Number(adx.toFixed(1)) : null,
    rsi: rsi !== null ? Number(rsi.toFixed(1)) : null,
    rvol: rvol !== null ? Number(rvol.toFixed(2)) : null,
    vwap: vwap !== null ? Number(vwap.toFixed(4)) : null,
    squeeze: squeezeNow
  };
}

export function shouldWakeAutonomousAI(bars, lastWakeAt = 0, now = Date.now()) {
  if (!lastWakeAt) return { wake: true, trigger: 'Initial market scan' };
  if (!Array.isArray(bars) || bars.length < 2) return { wake: false, trigger: 'Waiting for bars' };
  const reg = classifyRegime(bars);
  if (reg.regime === 'SQUEEZE_BREAKOUT') return { wake: true, trigger: 'Volatility squeeze breakout' };
  const patterns = detectCandlestickPatterns(bars);
  if (patterns.active.length) return { wake: true, trigger: `Candlestick pattern: ${patterns.active[0]}` };
  const last = bars.at(-1), prev = bars.at(-2);
  const moveOpen = last.o > 0 ? Math.abs(100 * (last.c / last.o - 1)) : 0;
  const movePrev = prev.c > 0 ? Math.abs(100 * (last.c / prev.c - 1)) : 0;
  const maxMove = Math.max(moveOpen, movePrev);
  const lowAdxChop = reg.adx !== null && reg.adx < 18;
  const moveThreshold = lowAdxChop ? 0.8 : 0.5;
  if (maxMove >= moveThreshold) return { wake: true, trigger: `Price move ${maxMove.toFixed(2)}%` };
  if (reg.rsi !== null && (reg.rsi <= 32 || reg.rsi >= 68 || (!lowAdxChop && (reg.rsi <= 35 || reg.rsi >= 65)))) {
    return { wake: true, trigger: `RSI(14) at ${reg.rsi.toFixed(1)}` };
  }
  const vols = bars.slice(-21, -1).map(b => b.v ?? 0).filter(v => v > 0);
  if (vols.length >= 5 && (last.v ?? 0) > 0) {
    const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
    if (avgVol > 0 && last.v >= avgVol * 1.8) return { wake: true, trigger: `Volume spike ${(last.v / avgVol).toFixed(1)}x` };
  }
  const periodicMs = lowAdxChop ? 60 * 60000 : 30 * 60000;
  if (now - lastWakeAt >= periodicMs) return { wake: true, trigger: lowAdxChop ? '60m chop check-in' : '30m periodic check-in' };
  return { wake: false, trigger: lowAdxChop ? `Skipping low-ADX chop (ADX ${reg.adx})` : 'Quiet market (Smart Wake-Up)' };
}

export function computeCandleStopPct(s, evalBars, entryPrice, atrOpt = null) {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Array.isArray(evalBars) || !evalBars.length) return s.stop;
  const pat = detectCandlestickPatterns(evalBars);
  if (!Number.isFinite(pat.setupLow) || pat.setupLow <= 0) return s.stop;
  const atr = Number.isFinite(atrOpt) && atrOpt > 0 ? atrOpt : (pat.atr ?? 0);
  const stopPrice = pat.setupLow - 0.15 * atr;
  const rawPct = 100 * (entryPrice - stopPrice) / entryPrice;
  if (!Number.isFinite(rawPct) || rawPct <= 0) return Math.min(s.stop, 0.5);
  return Math.max(0.25, Math.min(s.stop, rawPct));
}

function computeSizeCap(s, account, entryPrice, evalBars, options = {}) {
  if (s.sizeMode === 'usd' && Number.isFinite(s.sizeUsd)) return s.sizeUsd;
  if (s.sizeMode === 'risk') {
    const riskPct = Number.isFinite(s.riskPct) && s.riskPct > 0 ? s.riskPct : 1;
    const riskBase = Number.isFinite(options.budget) && options.budget > 0 ? Math.min(account.equity, options.budget) : account.equity;
    let stopDistPct = s.stop;
    if (s.atrStop > 0 && Number.isFinite(options.atr) && options.atr > 0 && entryPrice > 0) {
      stopDistPct = Math.min(stopDistPct, 100 * (s.atrStop * options.atr) / entryPrice);
    }
    if (s.candleStop) {
      stopDistPct = Math.min(stopDistPct, computeCandleStopPct(s, evalBars, entryPrice, options.atr));
    }
    stopDistPct = Math.max(0.25, stopDistPct);
    return (riskBase * (riskPct / 100)) / (stopDistPct / 100);
  }
  return account.equity * s.size / 100;
}

export function decision(s, closes, account, position, price, rules = isCrypto(s.symbol) ? cryptoReplayRules : null, options = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const mode = s.mode ?? 'momentum';
  const hasCustomRules = Boolean(s.rules?.entry?.length || s.rules?.exit?.length);
  const evalBars = options.bars ?? closes.map(c => ({ o: c, h: c, l: c, c }));
  const warmedUp = options.warmedUp !== false && (hasCustomRules ? evalBars.length >= ruleWarmupBars(s) : closes.length >= s.period);
  const pnl = position?.qty > 0 ? 100 * (price / position.entry - 1) : 0;
  const limit = account.equity <= account.dayStart * (1 - s.dailyLoss / 100);
  const atrStopPct = position?.qty > 0 && s.atrStop > 0 && Number.isFinite(options.atr) && options.atr > 0
    ? 100 * (s.atrStop * options.atr) / position.entry
    : Infinity;
  const savedStopPct = position?.qty > 0 && s.candleStop && Number.isFinite(options.stopPct ?? position?.stopPct) && (options.stopPct ?? position?.stopPct) > 0
    ? (options.stopPct ?? position.stopPct)
    : Infinity;
  const effectiveStop = Math.min(s.stop, atrStopPct, savedStopPct);
  const trailHit = position?.qty > 0 && s.trailingStop > 0 && Number.isFinite(options.highWater) && options.highWater > 0 &&
    price <= options.highWater * (1 - s.trailingStop / 100);
  const holdExpired = position?.qty > 0 && s.maxHoldBars > 0 && (options.holdBars ?? 0) >= s.maxHoldBars;
  if (position?.qty > 0) {
    const protective = limit || pnl <= -effectiveStop || pnl >= s.take || trailHit;
    if (protective) {
      const stopReason = savedStopPct <= atrStopPct && savedStopPct < s.stop
        ? `Pattern-tail stop-loss reached (-${effectiveStop.toFixed(2)}%)`
        : atrStopPct < s.stop
          ? `ATR stop-loss reached (-${effectiveStop.toFixed(2)}%)`
          : 'Stop-loss reached';
      return { side: 'sell', qty: position.qty, protective: true, stopLoss: !limit && (pnl <= -effectiveStop || trailHit),
        rationale: limit ? 'Maximum daily loss reached' : trailHit ? `Trailing stop reached (-${s.trailingStop}% from peak)` : pnl <= -effectiveStop ? stopReason : 'Take-profit reached' };
    }
    if (holdExpired) {
      return { side: 'sell', qty: position.qty, protective: true, rationale: `Max hold time reached (${s.maxHoldBars} bars)` };
    }
    if (!warmedUp) return null;
    if (mode === 'ai_notepad') {
      return { side: 'sell', qty: position.qty, protective: false, aiAutonomous: true, rationale: 'Evaluating AI Notepad exit strategy' };
    }
    if (mode === 'ai_autonomous') {
      const addCap = computeSizeCap(s, account, price, evalBars, options);
      const addBudget = Math.min(addCap, account.equity * s.exposure / 100 - account.exposure, account.cash);
      const buyQty = s.aiSizing === 'dynamic' && !limit && (options.cooldown ?? 0) <= 0 ? entryQty(addBudget, price, rules) : 0;
      return { side: 'sell', qty: position.qty, buyQty, protective: false, aiAutonomous: true, aiFreeRoam: true, rationale: 'Autonomous AI managing open position' };
    }
    if (hasCustomRules && s.rules.exit?.length) {
      const check = evaluateRuleSet(evalBars, s.rules, 'exit');
      if (check.pass) return { side: 'sell', qty: position.qty, protective: false, rationale: 'Custom exit rules matched' };
      return null;
    }
    if (mode === 'custom') return null;
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
      const channelLow = indicatorValue(evalBars, { indicator: 'donchian_low', period: s.period });
      if (channelLow !== null && latestClose < channelLow) {
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
  if (s.htfEma > 0 && Array.isArray(options.htfBars) && options.htfBars.length >= s.htfEma) {
    const htfEmaVal = indicatorValue(options.htfBars, { indicator: 'ema', period: s.htfEma });
    const htfClose = options.htfBars.at(-1)?.c;
    if (Number.isFinite(htfEmaVal) && Number.isFinite(htfClose) && htfClose < htfEmaVal) return null;
  }
  if (s.minAdx > 0) {
    const adxVal = computeADX(evalBars, 14);
    if (adxVal !== null && adxVal < s.minAdx) return null;
  }
  if (mode === 'ai_notepad' || mode === 'ai_autonomous') {
    const sizeCap = computeSizeCap(s, account, price, evalBars, options);
    const budget = mode === 'ai_autonomous'
      ? Math.min(account.equity * s.exposure / 100 - account.exposure, account.cash)
      : Math.min(sizeCap, account.equity * s.exposure / 100 - account.exposure, account.cash);
    const qty = entryQty(budget, price, rules);
    const stopPct = s.candleStop ? computeCandleStopPct(s, evalBars, price, options.atr) : undefined;
    return qty > 0
      ? { side: 'buy', qty, protective: false, aiAutonomous: true, ...(stopPct ? { stopPct } : {}), ...(mode === 'ai_autonomous' ? { aiFreeRoam: true } : {}), rationale: mode === 'ai_autonomous' ? 'Autonomous AI scanning market' : 'Evaluating AI Notepad entry strategy' }
      : null;
  }
  const rationale = entrySignal(s, evalBars);
  if (!rationale) return null;
  const sizeCap = computeSizeCap(s, account, price, evalBars, options);
  const budget = Math.min(sizeCap, account.equity * s.exposure / 100 - account.exposure, account.cash);
  const qty = entryQty(budget, price, rules);
  const stopPct = s.candleStop ? computeCandleStopPct(s, evalBars, price, options.atr) : undefined;
  return qty > 0 ? { side: 'buy', qty, rationale, ...(stopPct ? { stopPct } : {}) } : null;
}

export function entrySignal(s, evalBars) {
  if (evalBars.length < ruleWarmupBars(s)) return null;
  if (s.minAdx > 0) {
    const adxVal = computeADX(evalBars, 14);
    if (adxVal !== null && adxVal < s.minAdx) return null;
  }
  const closes = evalBars.map(bar => bar.c);
  let rationale = null;
  if (s.rules?.entry?.length) {
    const check = evaluateRuleSet(evalBars, s.rules, 'entry');
    if (check.pass) rationale = `Custom entry rules matched (${s.rules.entryLogic === 'any' ? 'ANY' : 'ALL'} of ${s.rules.entry.length})`;
  } else {
    const window = closes.slice(-s.period);
    const average = window.reduce((sum, value) => sum + value, 0) / window.length;
    const latestClose = closes.at(-1);
    if (s.mode === 'mean_reversion') {
      const variance = window.reduce((sum, v) => sum + (v - average) ** 2, 0) / window.length;
      const std = Math.sqrt(variance);
      const z = std > 0 ? (latestClose - average) / std : 0;
      const threshold = Math.max(0.5, s.entry || 1.5);
      const rsi = computeRSI(closes, Math.min(14, s.period));
      if (z <= -threshold && (rsi === null || rsi <= 40)) {
        rationale = `Mean reversion dip (Z ${z.toFixed(2)}, RSI ${(rsi ?? 0).toFixed(0)})`;
      }
    } else if (s.mode === 'breakout') {
      const channelHigh = indicatorValue(evalBars, { indicator: 'donchian_high', period: s.period });
      if (channelHigh === null) return null;
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
  }
  return rationale;
}

export function downsampleCurve(curve, maxPoints = 650) {
  if (!Array.isArray(curve) || curve.length <= maxPoints) return curve ?? [];
  const step = Math.ceil(curve.length / maxPoints);
  let worstIdx = 0;
  for (let i = 1; i < curve.length; i++) {
    if ((curve[i].drawdown ?? 0) < (curve[worstIdx].drawdown ?? 0)) worstIdx = i;
  }
  const indices = new Set([0, curve.length - 1, worstIdx]);
  for (let i = 0; i < curve.length; i += step) indices.add(i);
  return [...indices].sort((a, b) => a - b).map(i => curve[i]);
}

export function replay(s, bars, options) {
  let cash = options.capital, dayStart = cash, peak = cash, day, position, pending, cooldown = 0;
  const curve = [], trades = [];
  const historyBars = [];
  const rules = isCrypto(s.symbol) ? cryptoReplayRules : null;
  const budgetCap = Number.isFinite(options.budget) && options.budget > 0 ? options.budget : Infinity;
  let realized = 0;
  const warmupNeeded = ruleWarmupBars(s);
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
      const entryStopPct = buy && s.candleStop ? computeCandleStopPct(s, historyBars, price) : pending.stopPct;
      const sizeCap = computeSizeCap(s, { equity }, price, historyBars, { budget: Number.isFinite(budgetCap) ? budgetCap : undefined });
      const qty = buy ? equity <= dayStart * (1 - s.dailyLoss / 100) ? 0 :
        Math.min(pending.qty, entryQty(Math.min(cash, remainingBudget(budgetCap, realized), equity * s.exposure / 100, sizeCap), unitCost, rules)) : position.qty;
      if (qty > 0 && (!buy || !rules || qty * price >= rules.minValue)) {
        const fee = qty * price * options.fees / 10000;
        const pnl = buy ? null : qty * (price - position.entry) - fee - position.fee;
        if (!buy) realized += pnl;
        cash += (buy ? -1 : 1) * qty * price - fee;
        position = buy ? { qty, entry: price, fee, highWater: price, holdBars: 0, ...(entryStopPct ? { stopPct: entryStopPct } : {}) } : null;
        if (!buy && pending.stopLoss) cooldown = s.cooldown ?? 0;
        trades.push({ t: bar.t, side: pending.side, qty, price, fee, pnl, reason: pending.rationale || (buy ? 'Entry signal' : 'Exit signal') });
      }
      pending = null;
    }
    if (position) {
      position.holdBars = (position.holdBars ?? 0) + 1;
    }
    if (position && Number.isFinite(bar.l) && Number.isFinite(bar.h) && bar.l > 0 && bar.h >= bar.l) {
      const atrWindow = s.atrStop > 0 ? strategyWindow(s, historyBars, Math.min(14, s.period) + 1, options.maxGapMs) : [];
      const atr = s.atrStop > 0 ? computeATR(atrWindow, Math.min(14, s.period)) : null;
      const atrPct = s.atrStop > 0 && atr > 0 ? 100 * (s.atrStop * atr) / position.entry : Infinity;
      const candlePct = s.candleStop && Number.isFinite(position.stopPct) && position.stopPct > 0 ? position.stopPct : Infinity;
      const stopPct = Math.min(s.stop, atrPct, candlePct);
      const fixedStopPrice = position.entry * (1 - stopPct / 100);
      // Evaluate trailing stop against prior high-water mark before raising it with this bar's high (avoids same-bar look-ahead bias)
      const trailStopPrice = s.trailingStop > 0 ? (position.highWater ?? position.entry) * (1 - s.trailingStop / 100) : 0;
      const stopPrice = Math.max(fixedStopPrice, trailStopPrice);
      const takePrice = position.entry * (1 + s.take / 100);
      const stopped = bar.l <= stopPrice;
      const trigger = stopped ? Math.min(bar.o, stopPrice) : bar.h >= takePrice ? Math.max(bar.o, takePrice) : null;
      if (trigger !== null) {
        const price = trigger * (1 - options.slippage / 10000);
        const qty = position.qty;
        const fee = qty * price * options.fees / 10000;
        const pnl = qty * (price - position.entry) - fee - position.fee;
        realized += pnl;
        cash += qty * price - fee;
        position = null;
        if (stopped) cooldown = s.cooldown ?? 0;
        const reason = stopped
          ? (trailStopPrice > fixedStopPrice ? 'Trailing stop' : candlePct <= atrPct && candlePct < s.stop ? 'Pattern-tail stop' : atrPct < s.stop ? 'ATR stop' : 'Stop loss')
          : 'Take profit';
        trades.push({ t: bar.t, side: 'sell', qty, price, fee, pnl, reason });
      }
    }
    if (position) {
      position.highWater = Math.max(position.highWater ?? position.entry, Number.isFinite(bar.h) ? bar.h : bar.c);
    }
    const exposure = (position?.qty ?? 0) * bar.c;
    const equity = cash + exposure;
    peak = Math.max(peak, equity);
    curve.push({ t: bar.t, value: equity, drawdown: 100 * (equity / peak - 1) });
    historyBars.push(bar);
    const window = strategyWindow(s, historyBars, warmupNeeded, options.maxGapMs);
    const htfTf = ['4Hour', '1Day'].includes(s.timeframe) ? s.timeframe : '1Hour';
    const htfBars = s.htfEma > 0 ? aggregateBars(historyBars, htfTf) : undefined;
    const atr = s.atrStop > 0 ? computeATR(window, Math.min(14, s.period)) : null;
    pending = decision(s, window.map(b => b.c), { equity, cash: Math.min(cash, remainingBudget(budgetCap, realized)), dayStart, exposure }, position, bar.c, rules, {
      warmedUp: window.length >= warmupNeeded,
      cooldown,
      atr,
      bars: window,
      htfBars,
      highWater: position?.highWater,
      holdBars: position?.holdBars ?? 0,
      stopPct: position?.stopPct,
      budget: Number.isFinite(budgetCap) ? budgetCap : undefined,
      volume: Number.isFinite(bar.v) ? bar.v : undefined
    });
    if (cooldown > 0) cooldown--;
  }
  const final = curve.at(-1)?.value ?? cash;
  const drawdown = Math.min(0, ...curve.map(p => p.drawdown));
  const sells = trades.filter(t => t.side === 'sell' && Number.isFinite(t.pnl));
  const wins = sells.filter(t => t.pnl > 0);
  const losses = sells.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const totalFees = trades.reduce((sum, t) => sum + (t.fee ?? 0), 0);
  const dailyClose = new Map();
  for (const pt of curve) dailyClose.set(pt.t.slice(0, 10), pt.value);
  const dailyVals = [...dailyClose.values()];
  let sharpe = null;
  if (dailyVals.length >= 3) {
    const rets = [];
    for (let i = 1; i < dailyVals.length; i++) {
      if (dailyVals[i - 1] > 0) rets.push(dailyVals[i] / dailyVals[i - 1] - 1);
    }
    if (rets.length >= 2) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rets.length - 1);
      const std = Math.sqrt(variance);
      if (std > 1e-12) sharpe = (mean / std) * Math.sqrt(isCrypto(s.symbol) ? 365 : 252);
    }
  }
  const buyAndHold = series.length >= 2 && series[0].c > 0 ? 100 * (series.at(-1).c / series[0].c - 1) : null;
  const openPosition = position && series.length
    ? { qty: position.qty, entry: position.entry, mark: series.at(-1).c, unrealized: position.qty * (series.at(-1).c - position.entry) - position.fee }
    : null;
  let walkForward = null;
  if (curve.length >= 20) {
    const splitIdx = Math.floor(curve.length * 0.7);
    const splitTime = curve[splitIdx].t;
    const segmentStats = (pts, segTrades) => {
      const startEq = pts[0]?.value ?? options.capital;
      const endEq = pts.at(-1)?.value ?? startEq;
      let segPeak = startEq, segDd = 0;
      for (const p of pts) {
        segPeak = Math.max(segPeak, p.value);
        if (segPeak > 0) segDd = Math.min(segDd, 100 * (p.value / segPeak - 1));
      }
      const segSells = segTrades.filter(t => t.side === 'sell' && Number.isFinite(t.pnl));
      const segWins = segSells.filter(t => t.pnl > 0).length;
      return {
        returnPct: startEq > 0 ? 100 * (endEq / startEq - 1) : 0,
        maxDrawdown: segDd,
        closedTrades: segSells.length,
        winRate: segSells.length ? 100 * segWins / segSells.length : null
      };
    };
    walkForward = {
      splitAt: splitTime,
      inSample: segmentStats(curve.slice(0, splitIdx + 1), trades.filter(t => t.t <= splitTime)),
      outOfSample: segmentStats(curve.slice(splitIdx), trades.filter(t => t.t > splitTime))
    };
  }
  const metrics = {
    closedTrades: sells.length,
    wins: wins.length,
    losses: losses.length,
    winRate: sells.length ? 100 * wins.length / sells.length : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfit,
    grossLoss,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    expectancy: sells.length ? (grossProfit - grossLoss) / sells.length : null,
    totalFees,
    sharpe,
    buyAndHold,
    openPosition,
    walkForward,
    bars: series.length,
    timeframe: s.timeframe ?? '1Min'
  };
  return { curve, trades, final, drawdown, metrics };
}

export function synthetic(symbol, start, end, interval = 3600000) {
  const [,, change] = instruments[symbol];
  const base = instruments[symbol][1];
  const result = [];
  for (let time = Math.ceil(start / interval) * interval; time <= end; time += interval) {
    const i = time / interval;
    const price = j => base * (1 + 0.016 * Math.sin(j / 9) + 0.009 * Math.cos(j / 3.2) + 0.003 * Math.sin(j * 1.9) + change * 0.002);
    const o = price(i - 1), c = price(i);
    const wick = Math.abs(c - o) * 0.35 + base * 0.0004;
    result.push({ t: new Date(time).toISOString(), o, h: Math.max(o, c) + wick, l: Math.max(0.01, Math.min(o, c) - wick), c, v: Math.round(80000 + 25000 * Math.sin(i)) });
  }
  return result;
}
