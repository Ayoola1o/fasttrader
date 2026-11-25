export const strategyPlaybooks = {
  'turtle-channel': {
    name: 'Turtle Channel Breakout',
    category: 'Trend following',
    author: 'Original Turtles · Richard Donchian’s channels',
    source: 'The Original Turtle Trading Rules',
    url: 'https://www.newtraderu.com/wp-content/uploads/2013/06/turtlerules.pdf',
    evidence: 'Published trading rules',
    setup: 'A trend-following setup for liquid markets. The source describes daily futures trading.',
    entry: 'Buy when a candle closes above the high of the previous 20 candles.',
    exit: 'Sell when a candle closes below the low of the previous 10 candles, or when an app risk limit triggers.',
    caution: 'Repeated breakouts in a sideways market can produce a series of small losses.',
    adaptation: 'Uses 1-hour closes and long-only rules. The original uses intraday execution against daily levels, volatility-based sizing, a winner filter, and scaling rules.',
    draft: {
      timeframe: '1Hour',
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [{ left: { indicator: 'close' }, op: 'gt', right: { indicator: 'donchian_high', period: 20 } }],
        exit: [{ left: { indicator: 'close' }, op: 'lt', right: { indicator: 'donchian_low', period: 10 } }]
      }
    }
  },
  'bollinger-reentry': {
    name: 'Bollinger Band Re-entry',
    category: 'Mean reversion',
    author: 'Inspired by John Bollinger',
    source: 'Bollinger Band Rules',
    url: 'https://www.bollingerbands.com/bollinger-band-rules',
    evidence: 'Published indicator guidance',
    setup: 'A range-trading experiment using a 20-period band and an RSI filter.',
    entry: 'Buy after price crosses back above the lower band while RSI(14) is below 45.',
    exit: 'Sell at or above the 20-period moving average, or when an app risk limit triggers.',
    caution: 'Avoid assuming a bounce during a persistent downtrend. Price can keep tracking the lower band.',
    adaptation: 'FastTrader supplies the re-entry trigger, RSI threshold, and exit. The source discusses how to interpret bands.',
    draft: {
      timeframe: '15Min',
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'crosses_above', right: { indicator: 'bb_lower', period: 20 } },
          { left: { indicator: 'rsi', period: 14 }, op: 'lt', right: { indicator: 'number', value: 45 } }
        ],
        exit: [{ left: { indicator: 'close' }, op: 'gte', right: { indicator: 'sma', period: 20 } }]
      }
    }
  },
  'appel-macd': {
    name: 'MACD Signal Crossover',
    category: 'Momentum',
    author: 'Adapted from Gerald Appel',
    source: 'Technical Analysis: Power Tools for Active Investors, chapter 8',
    url: 'https://www.acledasecurities.com.kh/as/assets/pdf_zip/My%20Learnings%20-%20Technical%20Analysis%20-%20Power%20tools%20for%20active%20investors.pdf',
    evidence: 'Published signal examples',
    setup: 'A momentum setup that uses the signal line to confirm a turn in MACD.',
    entry: 'Buy when MACD crosses above its signal line on a closed candle.',
    exit: 'Sell on the opposite crossover, or when an app risk limit triggers.',
    caution: 'Frequent reversals in a sideways market can increase trading costs.',
    adaptation: 'Uses FastTrader’s 12/26/9 MACD on 15-minute bars. Appel also describes other periods and filters based on earlier zero-line crosses.',
    draft: {
      timeframe: '15Min',
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [{ left: { indicator: 'macd' }, op: 'crosses_above', right: { indicator: 'macd_signal' } }],
        exit: [{ left: { indicator: 'macd' }, op: 'crosses_below', right: { indicator: 'macd_signal' } }]
      }
    }
  },
  'crypto-volatility-squeeze': {
    name: 'Crypto Volatility Squeeze Breakout',
    category: 'Volatility expansion · Crypto',
    author: 'Inspired by John Carter (TTM Squeeze) · Fee-Aware Spot Adaptation',
    source: 'Mastering the Trade (Volatility Squeeze)',
    url: 'https://www.investopedia.com/terms/b/bollingerbands.asp',
    evidence: 'Systematic volatility breakout model',
    setup: 'Built specifically to overcome 50 bps round-trip spot crypto fees by waiting for compressed volatility to expand on heavy volume.',
    entry: 'Buy on 1-hour bars when Close breaks above Keltner Upper(20, 1.5 ATR) AND Bollinger Upper(20, 2σ) with Relative Volume (RVOL) > 1.5 and ADX(14) ≥ 20, aligned with 1H EMA(50).',
    exit: 'Sell if Close drops below SMA(20) or trailing stop / hard risk limits trigger.',
    caution: 'Trades infrequently by design (2–5 setups/week per pair). Avoid lowering timeframe to 1m/5m on 25 bps/side crypto accounts.',
    adaptation: 'Pairs 1-hour Keltner + Bollinger breakout confirmation with RVOL > 1.5, ADX ≥ 20 chop guard, 1H EMA(50) trend filter, and a 2.5% trailing stop.',
    draft: {
      timeframe: '1Hour',
      htfEma: 50,
      minAdx: 20,
      stop: 3,
      trailingStop: 2.5,
      take: 10,
      cooldown: 3,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'bb_upper', period: 20 } },
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'keltner_upper', period: 20 } },
          { left: { indicator: 'rvol', period: 20 }, op: 'gt', right: { indicator: 'number', value: 1.5 } }
        ],
        exit: [{ left: { indicator: 'close' }, op: 'lt', right: { indicator: 'sma', period: 20 } }]
      }
    }
  },
  'filtered-donchian-trend': {
    name: 'Regime-Filtered Donchian Trend',
    category: 'Trend following · Chop-Protected',
    author: 'Richard Donchian + Welles Wilder ADX Regime Filter',
    source: 'New Concepts in Technical Trading Systems (Wilder ADX)',
    url: 'https://www.investopedia.com/terms/a/adx.asp',
    evidence: 'Trend breakout + ADX/RVOL filter',
    setup: 'Solves sideways Donchian whipsaws by blocking 20-bar breakouts unless ADX(14) ≥ 22 and breakout volume exceeds 1.3× average.',
    entry: 'Buy when Close > 20-bar Donchian High AND ADX(14) ≥ 22 AND RVOL(20) > 1.3 above 1H EMA(50).',
    exit: 'Sell when Close < 10-bar Donchian Low or trailing stop triggers.',
    caution: 'Requires strong directional trend; stays flat during low-ADX consolidation.',
    adaptation: 'Adds ADX(14) ≥ 22, RVOL(20) > 1.3, and 1H EMA(50) alignment to the classic 20/10 channel.',
    draft: {
      timeframe: '1Hour',
      htfEma: 50,
      minAdx: 22,
      stop: 2.5,
      trailingStop: 2,
      take: 9,
      cooldown: 2,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'donchian_high', period: 20 } },
          { left: { indicator: 'rvol', period: 20 }, op: 'gt', right: { indicator: 'number', value: 1.3 } }
        ],
        exit: [{ left: { indicator: 'close' }, op: 'lt', right: { indicator: 'donchian_low', period: 10 } }]
      }
    }
  },
  'vwap-trend-reclaim': {
    name: 'Session VWAP Trend Reclaim',
    category: 'Intraday momentum · US Equities',
    author: 'Institutional Execution Benchmark · Brian Shannon (Anchored/Session VWAP)',
    source: 'Maximum Trading Gains With Anchored VWAP',
    url: 'https://www.investopedia.com/terms/v/vwap.asp',
    evidence: 'Institutional fair-value benchmark',
    setup: 'Designed for zero-commission liquid US equities & ETFs (SPY, QQQ, NVDA, AAPL). Captures trend continuations reclaiming session VWAP.',
    entry: 'Buy when Close crosses above Session VWAP while Close > EMA(20), RSI(14) > 50, and 1H Close > 1H EMA(50).',
    exit: 'Sell when Close crosses below Session VWAP or RSI(14) > 76.',
    caution: 'Best on liquid US stocks/ETFs during active session volume; avoid thin mid-day chop.',
    adaptation: 'Uses session-anchored VWAP with 1H EMA(50) macro trend filter and ADX ≥ 18.',
    draft: {
      timeframe: '15Min',
      htfEma: 50,
      minAdx: 18,
      stop: 1.5,
      trailingStop: 1.2,
      take: 4,
      cooldown: 2,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'crosses_above', right: { indicator: 'vwap' } },
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'ema', period: 20 } },
          { left: { indicator: 'rsi', period: 14 }, op: 'gt', right: { indicator: 'number', value: 50 } }
        ],
        exit: [
          { left: { indicator: 'close' }, op: 'crosses_below', right: { indicator: 'vwap' } },
          { left: { indicator: 'rsi', period: 14 }, op: 'gt', right: { indicator: 'number', value: 76 } }
        ]
      }
    }
  },
  'connors-rsi2-pullback': {
    name: 'Connors RSI(2) Uptrend Pullback',
    category: 'Mean reversion · US Equities',
    author: 'Larry Connors & Cesar Alvarez',
    source: 'Short Term Trading Strategies That Work',
    url: 'https://www.tradingmarkets.com/recent/why_does_rsi_2_work-673957.html',
    evidence: 'Published quantitative ETF study',
    setup: 'Buys sharp 2-bar exhaustion pullbacks inside a confirmed long-term uptrend on zero-commission ETFs/equities (SPY, QQQ).',
    entry: 'Buy when Close > EMA(200) AND 2-period Wilder RSI drops below 12.',
    exit: 'Sell into the bounce as soon as Close recovers above SMA(5).',
    caution: 'Designed for index ETFs and large-cap equities with 0 commission; never run without the EMA(200) uptrend filter.',
    adaptation: 'Runs on 15-minute or 1-hour closed bars with Close > EMA(200) + 1H EMA(50) protection.',
    draft: {
      timeframe: '15Min',
      htfEma: 50,
      stop: 2.5,
      trailingStop: 0,
      take: 4,
      cooldown: 2,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'ema', period: 200 } },
          { left: { indicator: 'rsi', period: 2 }, op: 'lt', right: { indicator: 'number', value: 12 } }
        ],
        exit: [{ left: { indicator: 'close' }, op: 'gt', right: { indicator: 'sma', period: 5 } }]
      }
    }
  },
  'bible-trend-pinbar': {
    name: 'Trend Pullback + Fib Pin Bar',
    category: 'Price action · Candlestick Bible',
    author: 'Munehisa Homma · The Candlestick Trading Bible (pp. 39–42, 96, 111–116)',
    source: 'The Candlestick Trading Bible — Pin Bar With Trend & Fibonacci Retracement',
    url: 'https://www.investopedia.com/terms/p/pinbar.asp',
    evidence: 'Price-action confluence playbook',
    setup: 'Trades high-probability bullish Pin Bars (long lower rejection tail ≥ 60% of candle range) only when pulling back into a 38%–68% Fibonacci retracement inside an established uptrend.',
    entry: 'Buy on 1-hour closed bars when Close > SMA(100), Fib Retracement(40) ≥ 38%, and a Bullish Pin Bar prints.',
    exit: 'Sell on a Bearish Pin Bar / Bearish Engulfing reversal, or via Pattern-Tail Stop-Loss and 3:1 Take-Profit.',
    caution: 'Never trade Pin Bars in isolation or in choppy 1m/5m noise; wait for higher-timeframe confluence.',
    adaptation: 'Uses 1H bars, Pattern-Tail Stop placement below the Pin Bar wick, 1.5% risk-based position sizing, and a 3:1 reward-to-risk target.',
    draft: {
      timeframe: '1Hour',
      htfEma: 50,
      sizeMode: 'risk',
      riskPct: 1.5,
      candleStop: true,
      stop: 3,
      trailingStop: 0,
      take: 9,
      cooldown: 2,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'sma', period: 100 } },
          { left: { indicator: 'fib_retracement', period: 40 }, op: 'gte', right: { indicator: 'number', value: 38 } },
          { left: { indicator: 'bullish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } }
        ],
        exit: [
          { left: { indicator: 'bearish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'bearish_engulfing' }, op: 'eq', right: { indicator: 'number', value: 1 } }
        ]
      }
    }
  },
  'bible-ma-engulfing': {
    name: 'Dynamic 8 & 21 EMA Bullish Engulfing (4H)',
    category: 'Trend continuation · Candlestick Bible',
    author: 'Munehisa Homma · The Candlestick Trading Bible (pp. 23–25, 117–124)',
    source: 'The Candlestick Trading Bible — Trading the Engulfing Bar With Moving Averages',
    url: 'https://www.investopedia.com/terms/b/bullishengulfingpattern.asp',
    evidence: '4-hour swing price-action playbook',
    setup: 'Captures institutional trend continuations on 4-hour charts when price pulls back to dynamic 8 & 21 moving average support and prints a full Bullish Engulfing candle.',
    entry: 'Buy on 4-hour bars when EMA(8) > EMA(21), ADX(14) ≥ 20, S/R Overhead Room(24) ≥ 1.5×, and a Bullish Engulfing candle closes.',
    exit: 'Sell on a Bearish Engulfing candle, Close < EMA(21), or when 3:1 R:R / Pattern-Tail Stop triggers.',
    caution: 'Avoid trading engulfing bars when overhead resistance caps reward-to-risk below 1.5:1.',
    adaptation: 'Runs natively on 4-hour candles with 1.5% risk-per-trade sizing, Pattern-Tail Stop below the engulfing low, and 3:1 R:R.',
    draft: {
      timeframe: '4Hour',
      minAdx: 20,
      sizeMode: 'risk',
      riskPct: 1.5,
      candleStop: true,
      stop: 4,
      trailingStop: 2.5,
      take: 12,
      cooldown: 1,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'ema', period: 8 }, op: 'gt', right: { indicator: 'ema', period: 21 } },
          { left: { indicator: 'bullish_engulfing' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'sr_room_ratio', period: 24 }, op: 'gte', right: { indicator: 'number', value: 1.5 } }
        ],
        exit: [
          { left: { indicator: 'bearish_engulfing' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'close' }, op: 'lt', right: { indicator: 'ema', period: 21 } }
        ]
      }
    }
  },
  'bible-inside-fakey': {
    name: 'Inside Bar "Fakey" Liquidity Stop-Hunt (4H)',
    category: 'Institutional reversal · Candlestick Bible',
    author: 'Munehisa Homma · The Candlestick Trading Bible (pp. 49–53, 148–157)',
    source: 'The Candlestick Trading Bible — The Inside Bar False Breakout Strategy',
    url: 'https://www.investopedia.com/terms/i/inside-day.asp',
    evidence: 'Stop-hunt false-breakout playbook',
    setup: 'Exploits smart-money liquidity sweeps where price forms an Inside Bar inside a Mother Bar, pokes below the Inside Bar low to trigger retail stops, and snaps back bullishly.',
    entry: 'Buy on 4-hour bars when Inside Bar Fakey == 1, Close > EMA(21), and S/R Overhead Room(24) ≥ 2×.',
    exit: 'Sell if a Bearish Pin Bar prints, Close < EMA(21), or via Pattern-Tail Stop below the sweep low and 3:1 R:R target.',
    caution: 'Wait for the candle to fully close back inside the Mother/Inside Bar range before entering.',
    adaptation: 'Evaluates 3-bar Mother + Inside + Liquidity-Sweep Fakey patterns on 4H candles with 1% risk sizing and Pattern-Tail Stop.',
    draft: {
      timeframe: '4Hour',
      sizeMode: 'risk',
      riskPct: 1,
      candleStop: true,
      stop: 3.5,
      trailingStop: 0,
      take: 10.5,
      cooldown: 1,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'inside_bar_fakey' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'close' }, op: 'gt', right: { indicator: 'ema', period: 21 } },
          { left: { indicator: 'sr_room_ratio', period: 24 }, op: 'gte', right: { indicator: 'number', value: 2 } }
        ],
        exit: [
          { left: { indicator: 'bearish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'close' }, op: 'lt', right: { indicator: 'ema', period: 21 } }
        ]
      }
    }
  },
  'bible-bollinger-range-pin': {
    name: 'Range Support + Bollinger Pin Bar',
    category: 'Range reversal · Candlestick Bible',
    author: 'Munehisa Homma · The Candlestick Trading Bible (pp. 71–78, 106–108)',
    source: 'The Candlestick Trading Bible — Trading Pin Bars in Range-Bound Markets',
    url: 'https://www.bollingerbands.com/bollinger-band-rules',
    evidence: 'Horizontal support + band rejection',
    setup: 'Trades clear horizontal range boundaries confirmed by lower Bollinger/RSI exhaustion and a long-wick Bullish Pin Bar rejection.',
    entry: 'Buy on 1-hour bars when Bullish Pin Bar == 1, RSI(14) < 45, and S/R Overhead Room(30) ≥ 2× to range resistance.',
    exit: 'Sell at the opposite Bollinger Upper Band(20), on a Bearish Pin Bar, or via Pattern-Tail Stop.',
    caution: 'Skip range fades right before major macro news breakouts when bands squeeze tightly.',
    adaptation: 'Combines Pin Bar tail rejection, RSI < 45 oversold confirmation, and ≥ 2:1 room to 30-bar resistance on 1H bars.',
    draft: {
      timeframe: '1Hour',
      sizeMode: 'risk',
      riskPct: 1,
      candleStop: true,
      stop: 2.5,
      trailingStop: 0,
      take: 6,
      cooldown: 2,
      rules: {
        entryLogic: 'all', exitLogic: 'any',
        entry: [
          { left: { indicator: 'bullish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } },
          { left: { indicator: 'rsi', period: 14 }, op: 'lt', right: { indicator: 'number', value: 45 } },
          { left: { indicator: 'sr_room_ratio', period: 30 }, op: 'gte', right: { indicator: 'number', value: 2 } }
        ],
        exit: [
          { left: { indicator: 'close' }, op: 'gte', right: { indicator: 'bb_upper', period: 20 } },
          { left: { indicator: 'bearish_pin_bar' }, op: 'eq', right: { indicator: 'number', value: 1 } }
        ]
      }
    }
  }
};
