# Feature Guide

> Detailed documentation for every module in RugPlay Manager, including configuration tips and usage examples.

[Back to Main README](../README.md)

---

## Table of Contents

- [Dashboard](#dashboard)
- [Portfolio](#portfolio)
- [Market Browser](#market-browser)
- [Live Feed](#live-feed)
- [Sniper Bot](#sniper-bot)
- [Sentinel (Stop-Loss / Take-Profit)](#sentinel)
- [Mirror Trading](#mirror-trading)
- [Dip Buyer](#dip-buyer)
- [Harvester (Auto-Claim)](#harvester)
- [Automation Log](#automation-log)
- [User Profiles & Leaderboard](#user-profiles--leaderboard)
- [Mobile Remote Access](#mobile-remote-access)
- [About & Guides](#about--guides)
- [Reset to Defaults](#reset-to-defaults)
- [Settings](#settings)

---

## Dashboard

<div align="center">
<img src="../DemoImages/Dashboard.png" alt="Dashboard" width="85%" />
</div>

The Dashboard is your central command center. It provides a real-time overview of everything happening with your account and your bot.

### What You'll See

- **Balance** — Your current Rugplay cash balance (available to trade)
- **Portfolio Value** — The combined value of all coins you currently hold
- **Net Worth** — Balance + Portfolio Value
- **Profit & Loss** — Your total P&L across all trades, shown in both dollar amount and percentage
- **Module Status** — At-a-glance indicators showing which modules are running, paused, or stopped

### How It Works

The Dashboard polls your Rugplay portfolio on a configurable interval (default: 10 seconds) and updates all metrics in real time. All data comes directly from Rugplay's API — nothing is estimated or simulated.

---

## Portfolio

<div align="center">
<img src="../DemoImages/Portfolio.png" alt="Portfolio" width="85%" />
</div>

The Portfolio view gives you a detailed breakdown of every coin you hold.

### Per-Coin Information

| Field                  | Description                              |
| ---------------------- | ---------------------------------------- |
| **Symbol**             | The coin's ticker (e.g., $DOGE)          |
| **Quantity**           | How many coins you hold                  |
| **Current Price**      | Live price from Rugplay                  |
| **Current Value**      | Quantity x Current Price                 |
| **Avg Purchase Price** | Your average cost basis per coin         |
| **Cost Basis**         | Total amount you invested in this coin   |
| **P&L %**              | Percentage gain or loss on this position |
| **24h Change**         | Price movement in the last 24 hours      |

### Actions

- **Sell** — Execute a sell order directly from the portfolio view
- **Add Sentinel** — Set up Stop-Loss / Take-Profit directly from your holdings
- **Refresh** — Force-refresh all portfolio data

---

## Market Browser

<div align="center">
<img src="../DemoImages/Market.png" alt="Market" width="85%" />
</div>

Browse the entire Rugplay coin marketplace with powerful filtering and sorting.

### Features

- **Search** — Find any coin by name or symbol
- **Sort** — Sort by market cap, price, 24h change, volume, or age
- **Filter** — Filter by price range, market cap, or creation date
- **Pagination** — Browse through hundreds of coins efficiently
- **One-Click Buy** — Purchase any coin directly from the market view

### Data Displayed

Each coin card shows: name, symbol, icon, current price, 24h change percentage, market cap, and creation date.

---

## Live Feed

<div align="center">
<img src="../DemoImages/Live.png" alt="Live Feed" width="85%" />
</div>

The Live Feed shows real-time trade activity across the entire Rugplay platform. This is one of the most powerful tools for understanding market sentiment.

### What You'll See

- **Trade Type** — Whether it was a buy or sell
- **Username** — Who made the trade
- **Coin** — Which coin was traded, with icon
- **Amount** — How many coins were bought/sold
- **Total Value** — Dollar value of the trade
- **Timestamp** — When the trade occurred (with relative "time ago" display)

### Use Cases

- **Spot whale activity** — See when large traders make big moves
- **Identify trends** — Notice when multiple traders pile into the same coin
- **Find Mirror targets** — Discover traders with good track records to add to your Mirror watchlist
- **Confirm your trades** — Verify that your bot's trades are executing correctly

---

## Sniper Bot

<div align="center">
<img src="../DemoImages/Sniper.png" alt="Sniper" width="85%" />
</div>

The Sniper Bot automatically purchases newly launched coins the moment they appear on the Rugplay market. Getting in early on new coins is often the key to the biggest gains.

### Configuration

| Setting        | Description                        | Default |
| -------------- | ---------------------------------- | ------- |
| **Buy Amount** | How much USD to spend per new coin | $100    |
| **Enabled**    | Whether the Sniper is active       | Off     |

### How It Works

1. The Sniper polls the Rugplay market API at regular intervals
2. When a coin is detected that wasn't present in the previous poll, it triggers
3. A buy order is placed immediately for the configured amount
4. The purchase is logged in your transaction history

### Tips

- Start with a small buy amount while you learn how the Sniper behaves
- Not every new coin will be profitable — the Sniper gives you speed, but use Sentinel to protect against losses
- Combine Sniper with Sentinel: auto-buy new coins, then auto-set a Stop-Loss to limit downside

---

## Sentinel

<div align="center">
<img src="../DemoImages/Sentinal.png" alt="Sentinel" width="85%" />
</div>

Sentinel is your automated portfolio protection system. It monitors coin prices and automatically executes sell orders when your configured thresholds are hit.

### Order Types

#### Stop-Loss

Automatically sells when a coin drops below a percentage threshold from your entry price.

**Example:** You bought $COIN at $1.00 with a -20% Stop-Loss. If the price drops to $0.80, Sentinel sells your entire position.

#### Positive Stop-Loss (Profit Floor)

Setting a positive stop-loss value creates a profit floor instead of a loss limiter. The sentinel only fires once the coin has actually reached that profit level, preventing premature sells if price hasn't risen that far yet.

**Example:** You set a +50% Stop-Loss. Sentinel waits until the coin reaches +50% profit, then locks in that level. If the price later drops back to +50%, it sells to protect your gains.

#### Take-Profit

Automatically sells when a coin rises above a percentage threshold from your entry price.

**Example:** You bought $COIN at $1.00 with a +100% Take-Profit. If the price reaches $2.00, Sentinel locks in your profit.

#### Trailing Stop

A dynamic stop-loss that moves up with the price but never moves down. This lets you ride uptrends while protecting against reversals.

**Example:** You set a 15% Trailing Stop. The coin goes from $1.00 to $3.00 — the trailing stop moves up to $2.55 (15% below the peak). If the price then drops to $2.55, it sells. But if the price keeps rising to $5.00, the stop moves to $4.25.

### Configuration

| Setting             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| **Coin**            | Which holding to protect                             |
| **Stop-Loss %**     | Percentage below entry to trigger sell (e.g., -20%)  |
| **Take-Profit %**   | Percentage above entry to trigger sell (e.g., +100%) |
| **Trailing Stop %** | Percentage below highest-seen price to trigger sell  |

### How It Works

Sentinel runs as a background task that continuously checks prices against your configured thresholds. When a threshold is hit, it immediately queues a sell order. All monitoring happens locally — prices are fetched from Rugplay's API.

### Management

The sentinel table includes full management features:

- **Search bar** — Filter sentinels by coin symbol
- **Status filter tabs** — Quick-filter for All, Active, Paused, or Triggered sentinels
- **Sortable columns** — Click any column header (Coin, Entry Price, Stop Loss, Take Profit, Sell %, Status) to sort ascending or descending
- **Coin icons** — Each sentinel row displays the coin's icon for quick visual identification
- **Transaction tooltips** — Hover a sentinel row to see recent buy/sell transactions for that coin

### Portfolio Integration

Coins protected by an active sentinel display a shield icon in the Portfolio holdings table. Hover the shield for a quick sentinel breakdown (SL, TP, TS, Sell %), or click it to jump to the Sentinel page with that coin's search pre-filled.

---

## Mirror Trading

<div align="center">
<img src="../DemoImages/Mirror.png" alt="Mirror Trading" width="85%" />
</div>

Mirror Trading lets you automatically copy the trades of other Rugplay users. Find successful traders, add them to your watchlist, and let the bot replicate their moves — scaled to your bankroll.

### How It Works

1. **Add a trader** — Enter a Rugplay username or user ID to your watchlist
2. **Monitor** — The bot monitors the Live Feed for trades by your watched traders
3. **Copy** — When a watched trader buys or sells, the bot executes the same trade for you
4. **Scale** — Trades are proportionally scaled to your portfolio. If a whale spends 5% of their portfolio on a coin, you spend 5% of yours.

### Configuration

| Setting         | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| **Whale List**  | List of traders to mirror                                                |
| **Scale Mode**  | How to size your trades relative to the whale (proportional to bankroll) |
| **Max Latency** | Skip trades if detection takes longer than this (default: 2 seconds)     |

### Tips

- Study the Live Feed before adding traders — look for consistent winners, not one-time lucky trades
- Use Sentinel alongside Mirror to protect against whales making bad trades
- The latency filter prevents copying stale trades — if we detect a trade too late, the price may have already moved

---

## Dip Buyer

The Dip Buyer automatically monitors the live trade feed for large sell-offs and buys dips on liquid coins when conditions are right. It uses a multi-signal confidence scoring engine to decide whether a sell-off is a buying opportunity or a red flag.

### How It Works

1. Polls recent trades every N seconds (configurable)
2. Filters for SELL trades exceeding the minimum sell-value threshold
3. Fetches coin data — market cap, volume, 24h change, holder distribution
4. Resolves **Coin Tier** settings based on market cap (if tiers enabled)
5. Applies hard gates: volume, market cap range, price drop limit, tier-specific sell minimum
6. Runs the **Signal Analysis Engine** — scores four weighted signals to produce a confidence score
7. Rejects if confidence is below threshold or any signal triggers a hard reject (whale dump, extreme concentration, excessive slippage)
8. Scales buy amount by confidence (optional), submits BUY via trade executor
9. Optionally auto-creates a sentinel (SL/TP) on the purchased coin

### Signal Analysis Engine

Every potential dip buy is scored by four weighted signals:

| Signal             | What It Measures                                     | Hard Reject?                   |
| ------------------ | ---------------------------------------------------- | ------------------------------ |
| **Sell Impact**    | How much the sell affects the coin's market cap      | Yes — if sell > 50% of mcap    |
| **Holder Safety**  | Distribution of holdings among top holders           | Yes — if top holder owns > 80% |
| **Momentum**       | Recent price trend via candlestick data              | No                             |
| **Volume Quality** | Whether 24h volume is healthy relative to market cap | No                             |

Each signal produces a raw score (0-1), which is multiplied by its configurable weight. The four weighted scores are summed to produce a final **confidence score** (0-1). Buys only execute when confidence exceeds the threshold (default: 0.55-0.65 depending on preset).

Slippage is also estimated — if buying the configured amount would move the price beyond the max slippage percentage, the trade is hard-rejected.

### Coin Tiers

Instead of applying the same buy amount and filters to every coin, you can define **Coin Tiers** based on market cap ranges. Each tier can have its own:

| Per-Tier Setting       | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| **Buy Amount**         | USD to spend when buying coins in this mcap range          |
| **Min Sell Value**     | Minimum sell trade value to trigger analysis for this tier |
| **Min Volume (24h)**   | Minimum 24h volume required for coins in this tier         |
| **Max Buy Slippage %** | Maximum acceptable price impact for this tier              |

When a per-tier value is set to 0, the global setting is used as a fallback. This lets you be strict with micro-caps (small buys, high volume requirements) while being more flexible with established coins.

Example tier setup:

| Tier   | Market Cap Range | Buy Amount | Min Sell | Min Volume | Max Slippage |
| ------ | ---------------- | ---------- | -------- | ---------- | ------------ |
| Micro  | $0 – $25K        | $200       | $1,000   | $3,000     | 5%           |
| Small  | $25K – $100K     | $500       | $2,000   | $5,000     | 0 (global)   |
| Medium | $100K – $500K    | $1,000     | $5,000   | $10,000    | 0 (global)   |
| Large  | $500K+           | $1,500     | $10,000  | $25,000    | 0 (global)   |

### Aggressiveness Presets

All presets are derived from a 875-coin backtest analysis across 189,000 configurations.

| Setting             | Conservative | Moderate   | Aggressive  |
| ------------------- | ------------ | ---------- | ----------- |
| Buy amount          | $500         | $1,000     | $2,000      |
| Min sell value      | $5,000       | $2,000     | $1,000      |
| Min volume (24h)    | $10,000      | $5,000     | $2,000      |
| Min market cap      | $100,000     | $20,000    | $10,000     |
| Max drop %          | -5%          | -5%        | -10%        |
| Min confidence      | 65%          | 55%        | 45%         |
| Max slippage        | 3%           | 5%         | 10%         |
| Daily limit         | 5            | 10         | 20          |
| Cooldown            | 300s         | 180s       | 60s         |
| Scale by confidence | Yes          | Yes        | No          |
| Auto sentinel       | Yes          | Yes        | Yes         |
| SL/TP               | -10%/+200%   | -30%/+500% | -50%/+1000% |
| Trailing stop       | Off          | Off        | Off         |

Each preset also includes a default set of four Coin Tiers. Tiers are disabled by default but can be toggled on from the Strategy tab.

### Configuration

| Setting                 | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Preset**              | Conservative, Moderate, or Aggressive (auto-fills all settings)                 |
| **Coin Tiers**          | Toggle per-tier buy sizing, sell thresholds, volume & slippage                  |
| **Buy Amount**          | Fallback USD amount when tiers are off or no tier matches                       |
| **Min Sell Value**      | Global minimum sell trade value (pre-filter before analysis)                    |
| **Min Confidence**      | Minimum signal score to allow a buy (0.0 – 1.0)                                 |
| **Max Slippage %**      | Maximum acceptable price impact from your buy                                   |
| **Signal Weights**      | Per-signal weight tuning (sell impact, holder safety, momentum, volume quality) |
| **Scale by Confidence** | Reduce buy amount proportionally when confidence is lower                       |
| **Skip Top N**          | Ignore sells from the top N holders                                             |
| **Cooldown Per Coin**   | Seconds to wait before re-buying the same coin                                  |
| **Daily Buy Limit**     | Maximum dip buys per 24-hour rolling window                                     |
| **Daily Spend Limit**   | Maximum USD spent on dip buys per day                                           |
| **Portfolio Aware**     | Check position size before buying to avoid over-concentration                   |
| **Max Position %**      | Maximum portfolio percentage any single coin can reach                          |
| **Auto Sentinel**       | Automatically create SL/TP/trailing stop on each dip buy                        |
| **Coin Blacklist**      | Per-symbol blocklist to exclude specific coins                                  |

### Restart Safety

The Dip Buyer persists its state across restarts. On startup it restores cooldowns, daily buy counts, and seen trade keys from the automation log and a persisted tick timestamp, preventing duplicate purchases.

---

## Harvester

The Harvester automatically claims your 12-hour Rugplay reward. Never miss a claim cycle again.

### How It Works

1. The Harvester tracks when your last claim was made (stored in the local database)
2. A timer counts down to the next eligible claim time
3. When the timer hits zero, the Harvester sends the claim request automatically
4. The cycle resets and begins counting down again

### Configuration

The Harvester runs automatically once enabled — no additional configuration needed. It handles timing, retries, and edge cases like server downtime.

---

## Automation Log

The Automation Log provides a centralized, persistent record of every automated action taken by any module.

### What Gets Logged

| Module    | Action   | Details                                |
| --------- | -------- | -------------------------------------- |
| Sniper    | BUY      | Symbol, amount, price, trigger info    |
| Sentinel  | SELL     | Symbol, trigger type (SL/TP/TS), price |
| Mirror    | BUY/SELL | Symbol, whale username, scaled amount  |
| Harvester | CLAIM    | Reward amount claimed                  |
| Dip Buyer | BUY      | Symbol, seller info, preset used       |

### Features

- **Module filter buttons** — View all logs or filter by specific module
- **Persistent storage** — All entries stored in SQLite, survive restarts
- **Live updates** — New entries appear in real time via Tauri events
- **JSON details** — Each entry includes a details blob with module-specific metadata

---

## User Profiles & Leaderboard

### User Profiles

Click any username in the Live Feed, holder list, or leaderboard to view their full profile:

- Avatar, username, name, bio
- Balance, portfolio value, holdings count, total volume
- 24h activity breakdown (transactions, buy/sell volume)
- Local reputation score (0-100) with color-coded trust badge
- Created coins list (clickable — navigates to coin detail)
- Recent transactions
- "Report Rug" button and external Rugplay link

### Leaderboard

Four category tabs pulled from the Rugplay API:

| Tab                    | Ranks by                    |
| ---------------------- | --------------------------- |
| **Top Rugpullers**     | Most value extracted        |
| **Biggest Losers**     | Largest trading losses      |
| **Cash Kings**         | Highest liquid cash balance |
| **Paper Millionaires** | Richest total portfolio     |

Features: player search, gold/silver/bronze rank medals, inline reputation badges, clickable rows navigate to user profiles.

### Reputation System

Locally tracked trust score per user, persisted in SQLite:

- Base score: 50/100 for new users
- Rug pull report: -15 points
- Rugpuller leaderboard appearance: -5 points
- Visual: green (70+), yellow (40-69), red (<40)

---

## Mobile Remote Access

<div align="center">
<img src="../DemoImages/Mobile.png" alt="Mobile Access" width="85%" />
</div>

Access your bot from any device — phone, tablet, or another computer — via a secure Cloudflare tunnel.

### How It Works

1. **Start** the mobile server from the Mobile Access page in the desktop app
2. **Scan** the QR code with your phone's camera (or type the URL manually)
3. **Enter** the 6-digit PIN displayed on the desktop app
4. **Monitor** your portfolio, view recent trades, check module status — all from your phone

### Security

- The connection uses a PIN-based authentication system
- Each session generates a unique access token
- The tunnel is created through Cloudflare Quick Tunnels (`trycloudflare.com`) — HTTPS by default
- `cloudflared` is auto-downloaded on first use and cached in app data
- No data is stored on any external server
- You can disconnect all sessions from the desktop app at any time

### Role-Based Access

Three session roles control what each connected device can do:

| Role        | Access                                   |
| ----------- | ---------------------------------------- |
| **Viewer**  | Portfolio, module status (read-only)     |
| **Trusted** | + Sentinels, sniper status, activity log |
| **Admin**   | + Buy/sell trading                       |

You can change a session's role, kick sessions, and set the default role for new connections from the desktop app.

### What You Can See on Mobile

- Portfolio summary (balance, net worth, P&L)
- All coin holdings with current values
- Recent trade activity
- Module status (which modules are running)
- Connection status and session info

---

## About & Guides

The About & Guides page provides research-backed insights and embedded documentation directly within the app.

### Tabs

| Group  | Tab            | Content                                                                                |
| ------ | -------------- | -------------------------------------------------------------------------------------- |
| About  | Overview       | Research pipeline stats, tier distribution charts, market insights, tech stack         |
| About  | Research Data  | Tier performance comparisons, optimal sentinel configs, top coins by Sortino ratio     |
| About  | Best Settings  | Data-driven settings with explanations, DipBuyer preset comparison, strategy takeaways |
| Guides | Feature Guide  | Full feature documentation (rendered in-app)                                           |
| Guides | Strategy Guide | Interactive strategy selector with per-module descriptions                             |
| Guides | Installation   | Installation and setup instructions                                                    |
| Guides | Architecture   | Technical architecture documentation                                                   |
| Guides | Security       | Security and transparency details                                                      |

All guide content is rendered from Markdown embedded at compile time, so docs are always in sync with your installed version.

### Research Data

The Overview and Research Data tabs pull from a research manifest built by analyzing 875 coins across 92,873 candle rows and ~189,000 backtest configurations. Key findings:

- Trailing stops consistently hurt performance across all market cap tiers
- Optimal balanced sentinel config: SL -30%, TP 500%, no trailing stop
- Median return across all coins: 522% (but median drawdown: -98.5%)
- 34.7% of coins exhibit pump-and-dump patterns

---

## Reset to Defaults

Both the Settings page and DipBuyer page include a **Reset to Defaults** button that restores all parameters to research-backed optimal values.

### Settings Reset

- Applies the balanced sentinel config (SL -30%, TP 500%, trailing stop off)
- Batch-updates all existing sentinels that don't have custom settings
- Resets notification and general preferences

### DipBuyer Reset

- Regenerates all coin tiers with research-derived market cap boundaries
- Restores the selected aggressiveness preset's parameters
- Preserves your coin blacklist

---

## Settings

RugPlay Manager provides per-module configuration through the Settings page, organized into tabs:

### General

- Auto-refresh interval
- Notification preferences
- Theme settings

### Sniper

- Buy amount per new coin
- Enable/disable toggle

### Sentinel

- Default stop-loss percentage
- Default take-profit percentage
- Trailing stop configuration

### Mirror

- Whale watchlist management
- Trade scaling settings
- Latency threshold

### Risk Management

- Maximum position size
- Maximum number of simultaneous trades
- Cool-down period between trades

### Notifications

- Desktop notification preferences
- Sound alerts
- Trade confirmation alerts

---

[Back to Main README](../README.md) · [Security >](SECURITY.md)
