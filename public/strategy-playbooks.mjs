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
  }
};
