# FastTrader

FastTrader is a single-user trading workspace for local demo use and Alpaca Paper. It runs on Node.js 24 or later with no package installation.

## Run the demo

```powershell
npm start
```

Open http://127.0.0.1:3000. In **Screener**, find SPY and select **Build strategy**. Name and save a version, then choose **Backtest v1** and **Run backtest**. Return to **Strategy Editor**, select the saved version, and start the bot. The dashboard updates when the strategy finds a setup and the local simulated broker fills an order. Synthetic bars arrive every five seconds in this mode.

In **Settings**, disconnect the feed or broker to test the bot's waiting state, then reconnect both. A browser that has loaded the workspace can reopen the cached shell, charts, holdings, and saved runs while the backend is unreachable. Strategy edits are stored as drafts. Select **Queue draft sync** offline to save a new version on reconnection. A version conflict leaves the local draft available for review. Closing the browser leaves the server worker running.

Use **Live Trading** to launch a bot from a saved strategy version and filter the roster by active, paused, or stopped. Resume and Restart use the bot's pinned version. The workspace supports one bot per strategy and concurrent active bots on distinct instruments.

## Connect Alpaca Paper

Copy `.env.example` to `.env`, set `FASTTRADER_MODE=alpaca`, and add credentials from a dedicated Alpaca Paper account. The app binds to loopback and stores snapshots in `.fasttrader/` with separate files for demo and each Alpaca key. Credentials stay in the server environment. Run a single server process for the workspace.

The engine shares one Alpaca stock websocket and reconciles the account, open orders, positions, and unresolved submissions through the Paper REST API. It uses completed minute bars and requires a fresh signal after a restart or outage. The delayed SIP feed is available for monitoring. Entry orders use a day limit at the risk reference price and exits use day market orders. When a submission outcome is ambiguous, the engine looks up its client order ID and blocks further orders while the outcome is unresolved. Pause and Stop prevent subsequent signals from submitting orders. Existing broker orders remain open until filled, canceled, or expired.

Set `GEMINI_API_KEY` in `.env` and restart FastTrader to enable optional AI confirmation. Settings shows the configured provider. Select **Require AI confirmation for non-protective signals** in Strategy Editor and save a new version. Gemini takes precedence when both AI keys are set. If only `OPENAI_API_KEY` is set, FastTrader uses OpenAI. The model can approve or veto a deterministic entry or exit. Protective exits use the risk engine directly. Historical replay supports deterministic versions, using next-bar-open fills, fees and slippage. Replay results can differ from live paper fills.

Bots share one feed and each reads its instrument's rolling bar window. The server allows three AI requests in flight with at most one pending confirmation per bot. Confirmations expire after 12 seconds or as soon as a newer bar arrives, the bot changes state, or the connection must be reconciled. Order approval is serialized and checks broker state, share ownership, buying power, and account exposure again before submitting.

## Vercel deployment

The frontend assets in `public/` can be hosted on Vercel. Run the trading engine, Alpaca stream, and persistent storage on an always-on host. The current API binds to loopback and serves a single local workspace. A hosted frontend requires an authenticated API connection to that worker and persistent storage for workspace data. Keep the Alpaca and AI credentials in the worker's environment. [Vercel Functions duration limits](https://vercel.com/docs/functions/configuring-functions/duration)

## Verification

```powershell
npm test
```

The test suite covers next-bar execution, sizing, loss limits, strategy versioning, demo fills and portfolio impact, feed and broker outage gating, and resumption. Live Alpaca Paper and AI provider checks require configured credentials.

Current scope includes six US stocks and ETFs, a minute-bar momentum strategy, basic portfolio analytics, and in-app notifications. Crypto and forex provider coverage, broker realized P&L, multi-user accounts and subscriptions, and hosting of the persistent worker remain follow-up work.
