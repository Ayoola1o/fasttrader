import { decision, strategyWindow, computeATR, isCrypto, cryptoReplayRules, roundDown } from './engine.mjs';

export function createPaperPortfolio(strategies, { capital, split, fees, slippage }) {
  const books = strategies.map((s, i) => ({
    s, cash: capital * (i === 0 ? split : 1 - split), position: null, cooldown: 0, pending: null, day: null, dayStart: null
  }));
  return { capital, fees, slippage, books, orders: [], orderCount: 0, internalQty: 0 };
}

export function stepPaperPortfolio(session, bar, history, fillPrice = bar.o) {
  const { books, fees, slippage, orders } = session;
  const rules = isCrypto(books[0].s.symbol) ? cryptoReplayRules : null;
  const increment = rules?.increment ?? 1;
  const intents = books.map(book => {
    const proposal = book.pending;
    if (!proposal) return 0;
    if (proposal.side === 'sell') return -(book.position?.qty ?? 0);
    const price = fillPrice * (1 + slippage / 10000) * (1 + fees / 10000);
    const qty = roundDown(Math.min(proposal.qty, book.cash / price), increment);
    return qty >= (rules?.minimum ?? 1) && qty * fillPrice >= (rules?.minValue ?? 0) ? qty : 0;
  });
  const buys = intents.reduce((sum, qty) => sum + Math.max(0, qty), 0);
  const sells = intents.reduce((sum, qty) => sum + Math.max(0, -qty), 0);
  const crossed = Math.min(buys, sells);
  let net = Number((buys - sells).toFixed(9));
  if (rules && (Math.abs(net) < rules.minimum || Math.abs(net) * fillPrice < rules.minValue)) net = 0;
  // Keep sub-minimum residuals unfilled while allowing opposing allocations to cross.
  session.internalQty += crossed;
  const externalPrice = fillPrice * (1 + Math.sign(net) * slippage / 10000);
  if (net) {
    session.orderCount++;
    orders.push({ t: bar.t, side: net > 0 ? 'buy' : 'sell', qty: Math.abs(net), price: externalPrice, fee: Math.abs(net) * externalPrice * fees / 10000 });
    if (orders.length > 30) orders.shift();
  }
  books.forEach((book, index) => {
    const intent = intents[index];
    if (intent) {
      const sideQty = intent > 0 ? buys : sells;
      const share = Math.abs(intent) / sideQty;
      const internal = share * crossed;
      const external = Math.sign(intent) === Math.sign(net) ? share * Math.abs(net) : 0;
      const qty = internal + external;
      const value = internal * fillPrice + external * externalPrice;
      if (qty > 0) {
        book.cash -= Math.sign(intent) * value + external * externalPrice * fees / 10000;
        if (intent > 0) book.position = { qty, entry: value / qty, highWater: fillPrice, holdBars: 0, ...(book.pending?.stopPct ? { stopPct: book.pending.stopPct } : {}) };
        else {
          book.position.qty = Number((book.position.qty - qty).toFixed(9));
          if (book.position.qty <= 0) book.position = null;
          if (book.pending.stopLoss) book.cooldown = book.s.cooldown ?? 0;
        }
      }
    }
    const { s, position } = book;
    if (position) {
      position.highWater = Math.max(position.highWater, bar.c);
      position.holdBars++;
    }
    const exposure = (position?.qty ?? 0) * bar.c;
    const equity = book.cash + exposure;
    const day = bar.t.slice(0, 10);
    if (day !== book.day) {
      book.day = day;
      book.dayStart = book.equity ?? equity;
    }
    book.equity = equity;
    const window = strategyWindow(s, history);
    book.pending = decision(s, window.map(candle => candle.c), { cash: book.cash, equity, dayStart: book.dayStart, exposure }, position,
      bar.c, rules, { bars: window, volume: bar.v, cooldown: book.cooldown, highWater: position?.highWater,
        holdBars: position?.holdBars, stopPct: position?.stopPct, atr: s.atrStop > 0 ? computeATR(window, Math.min(14, s.period)) : null });
    if (book.cooldown > 0) book.cooldown--;
  });
  const day = bar.t.slice(0, 10);
  if (session.riskDay !== day) {
    session.riskDay = day;
    session.dayStart = books.reduce((sum, book) => sum + book.dayStart, 0);
    session.lossLocked = false;
  }
  session.lossLocked ||= books.reduce((sum, book) => sum + book.equity, 0) <=
    session.dayStart * (1 - Math.min(...books.map(book => book.s.dailyLoss)) / 100);
  if (session.lossLocked) {
    for (const book of books) book.pending = book.position ? { side: 'sell' } : null;
  }
}

export function paperPortfolioSummary(session) {
  const { capital, books, orders, internalQty, orderCount } = session;
  return { capital, final: books.reduce((sum, book) => sum + (book.equity ?? book.cash), 0), orderCount,
    orders: orders.slice(-30), internalQty, strategies: books.map(({ s, cash, equity, position }) => ({
      name: s.name, version: s.version, cash, equity: equity ?? cash, qty: position?.qty ?? 0
    })) };
}

export function replayPortfolio(strategies, bars, config) {
  const session = createPaperPortfolio(strategies, config);
  const history = [];
  for (const bar of bars) {
    history.push(bar);
    stepPaperPortfolio(session, bar, history);
  }
  return paperPortfolioSummary(session);
}
