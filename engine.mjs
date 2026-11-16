export const instruments = {
  SPY: ['SPDR S&P 500 ETF', 589.43, 0.84],
  QQQ: ['Invesco QQQ Trust', 514.22, 1.12],
  AAPL: ['Apple Inc.', 228.68, 0.62],
  NVDA: ['NVIDIA Corporation', 142.81, 2.34],
  MSFT: ['Microsoft Corporation', 425.52, -0.32],
  TSLA: ['Tesla, Inc.', 347.91, -1.18]
};

export const defaults = {
  name: 'Momentum Alpha', symbol: 'SPY', period: 12, entry: 0.1, exit: -0.1,
  size: 10, exposure: 20, dailyLoss: 3, stop: 2, take: 4, ai: false
};

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
  return result;
}

export function decision(s, closes, account, position, price) {
  if (closes.length < s.period || !Number.isFinite(price) || price <= 0) return null;
  const window = closes.slice(-s.period);
  const average = window.reduce((sum, value) => sum + value, 0) / window.length;
  const momentum = 100 * (closes.at(-1) / average - 1);
  const pnl = position?.qty > 0 ? 100 * (price / position.entry - 1) : 0;
  const limit = account.equity <= account.dayStart * (1 - s.dailyLoss / 100);
  if (position?.qty > 0) {
    if (limit || pnl <= -s.stop || pnl >= s.take || momentum < s.exit) {
      return { side: 'sell', qty: position.qty, protective: limit || pnl <= -s.stop || pnl >= s.take,
        rationale: limit ? 'Maximum daily loss reached' : pnl <= -s.stop ? 'Stop-loss reached' : pnl >= s.take ? 'Take-profit reached' : 'Price fell below the exit threshold' };
    }
    return null;
  }
  if (limit || momentum <= s.entry) return null;
  const budget = Math.min(account.equity * s.size / 100, account.equity * s.exposure / 100 - account.exposure, account.cash);
  const qty = Math.floor(budget / price);
  return qty > 0 ? { side: 'buy', qty, rationale: 'Price is ' + momentum.toFixed(2) + '% above its moving average' } : null;
}

export function replay(s, bars, options) {
  let cash = options.capital, dayStart = cash, peak = cash, day, position, pending;
  const curve = [], trades = [];
  const closes = [];
  for (const bar of bars) {
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
        Math.min(pending.qty, Math.floor(Math.min(cash, equity * s.exposure / 100, equity * s.size / 100) / unitCost)) : position.qty;
      if (qty > 0) {
        const fee = qty * price * options.fees / 10000;
        const pnl = buy ? null : qty * (price - position.entry) - fee - position.fee;
        cash += (buy ? -1 : 1) * qty * price - fee;
        position = buy ? { qty, entry: price, fee } : null;
        trades.push({ t: bar.t, side: pending.side, qty, price, fee, pnl });
      }
    }
    const exposure = (position?.qty ?? 0) * bar.c;
    const equity = cash + exposure;
    peak = Math.max(peak, equity);
    curve.push({ t: bar.t, value: equity, drawdown: 100 * (equity / peak - 1) });
    closes.push(bar.c);
    pending = decision(s, closes, { equity, cash, dayStart, exposure }, position, bar.c);
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
