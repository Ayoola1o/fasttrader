# FastTrader

FastTrader is a single-user trading workspace for local demo use and Alpaca Paper. It runs on Node.js 24 or later with no package installation.

## Run the demo

```powershell
npm start
```

Open http://127.0.0.1:3000. In **Screener**, find SPY and select **Build strategy**. Name and save a version, then choose **Backtest v1** and **Run backtest**. Return to **Strategy Editor**, select the saved version, and start the bot. The dashboard updates when the strategy finds a setup and the local simulated broker fills an order. Synthetic bars arrive every five seconds in this mode.

In **Settings**, disconnect the feed or broker to test the bot's waiting state, then reconnect both. A browser that has loaded the workspace can reopen the cached shell, charts, holdings, and saved runs while the backend is unreachable. Strategy edits are stored as drafts. Select **Queue draft sync** offline to save a new version on reconnection. A version conflict leaves the local draft available for review. Closing the browser leaves the server worker running.

Use **Live Trading** to launch a bot from a saved strategy version. Enter its USD budget before launch, then click a bot row to see its position, allocation, realized and unrealized P&L, signals, and orders. Resume and Restart from the roster reuse the saved budget. To change it, pause the bot and enter a new amount in its session. The workspace supports one bot per strategy and concurrent active bots on distinct instruments.

The bot budget caps new purchases alongside account buying power and strategy risk limits. Open position costs, pending buy orders, and net realized losses count against that budget. Budgets are execution limits within the shared paper account. The engine continues to reconcile existing orders and holdings, and older bots without a budget can exit positions but cannot place new buys until a budget is set. Session P&L uses recorded fills and excludes fees. **Latest evaluation** shows the result of the last evaluated bar even when no order was submitted.

The **Crypto** screener includes BTC/USD, ETH/USD, SOL/USD, and LTC/USD. Crypto strategies use a separate shared Alpaca Crypto US feed and historical data endpoint. In Alpaca mode, the bot checks the account and asset eligibility, broker-reported order increments, non-marginable buying power, and the bot's USD budget. Crypto backtests use modeled minimums and fee assumptions. Alpaca crypto fees or manual trades can change broker quantities. The engine blocks orders when the broker position cannot be reconciled with attributed fills.

## Connect Alpaca Paper

Copy `.env.example` to `.env`, set `FASTTRADER_MODE=alpaca`, and add credentials from a dedicated Alpaca Paper account. The app binds to loopback and stores snapshots in `.fasttrader/` with separate files for demo and each Alpaca key. Credentials stay in the server environment. Run a single server process for the workspace.

The engine shares one Alpaca stock websocket and reconciles the account, open orders, positions, and unresolved submissions through the Paper REST API. It uses completed minute bars and requires a fresh signal after a restart or outage. The delayed SIP feed is available for monitoring. Entry orders use a day limit at the risk reference price and exits use day market orders. When a submission outcome is ambiguous, the engine looks up its client order ID and blocks further orders while the outcome is unresolved. Pause and Stop prevent subsequent signals from submitting orders. Existing broker orders remain open until filled, canceled, or expired.

Set `GEMINI_API_KEY` in `.env` and restart FastTrader to enable optional AI confirmation. Settings shows the configured provider. Select **Require AI confirmation for non-protective signals** in Strategy Editor and save a new version. Gemini takes precedence when both AI keys are set. If only `OPENAI_API_KEY` is set, FastTrader uses OpenAI. The model can approve or veto a deterministic entry or exit. Protective exits use the risk engine directly. Historical replay supports deterministic versions, using next-bar-open fills, fees and slippage. Replay results can differ from live paper fills.

Bots share one feed and each reads its instrument's rolling bar window. The server allows three AI requests in flight with at most one pending confirmation per bot. Confirmations expire after 12 seconds or as soon as a newer bar arrives, the bot changes state, or the connection must be reconciled. Order approval is serialized and checks broker state, share ownership, buying power, and account exposure again before submitting.

## Vercel deployment

FastTrader supports a single owner account for the trading workspace. The first sign-up requires a setup code. Future visits use the owner's email and password. Passwords are hashed, sessions expire after 12 hours, and Sign out revokes the current session. Signing out leaves enabled bots running.

1. Deploy the Node.js app on an always-on host with HTTPS and mount persistent storage for `FASTTRADER_DATA_DIR`. Use one worker instance. Set `FASTTRADER_HOST=0.0.0.0`, `FASTTRADER_DATA_DIR` to the mounted directory, and the Alpaca Paper and AI provider settings on that host.
2. Generate two separate random values. Set `WORKER_SHARED_SECRET` on the worker and Vercel, and set `FASTTRADER_SIGNUP_CODE` only on the worker. Run the following command once per value in your terminal.

   ```text
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Import the repo into Vercel with the included `vercel.json`. Set `FASTTRADER_WORKER_URL` to the worker's HTTPS origin and deploy. Vercel serves the frontend and forwards API requests to the worker. The worker verifies the bridge credential and the owner's session. [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
4. On the Vercel site, choose **Create an account**, enter your email, a password of at least 12 characters, and the setup code. Once the account is created, remove `FASTTRADER_SIGNUP_CODE` from the worker's environment.

For local sign-in, set `FASTTRADER_SIGNUP_CODE` in `.env` and restart with `npm start`. A fresh loopback demo without a setup code opens directly. Signed-in workspace data and drafts remain available in the current tab during a disconnect. The browser caches only the app shell across tab closures for signed-in workspaces.

## Verification

```powershell
npm test
```

The test suite covers next-bar execution, sizing, loss limits, strategy versioning, demo fills and portfolio impact, feed and broker outage gating, and resumption. Live Alpaca Paper and AI provider checks require configured credentials.

Current scope includes six US stocks and ETFs, four USD crypto pairs, a minute-bar momentum strategy, basic portfolio analytics, and in-app notifications. Crypto market-cap data, forex coverage, broker-wide realized P&L, multi-user accounts and subscriptions, and hosting of the persistent worker remain follow-up work.
