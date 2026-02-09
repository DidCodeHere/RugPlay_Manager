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
- [Harvester (Auto-Claim)](#harvester)
- [Mobile Remote Access](#mobile-remote-access)
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

## Mobile Remote Access

<div align="center">
<img src="../DemoImages/Mobile.png" alt="Mobile Access" width="85%" />
</div>

Access your bot from any device — phone, tablet, or another computer — via a secure tunnel.

### How It Works

1. **Start** the mobile server from the Mobile Access page in the desktop app
2. **Scan** the QR code with your phone's camera (or type the URL manually)
3. **Enter** the 6-digit PIN displayed on the desktop app
4. **Monitor** your portfolio, view recent trades, check module status — all from your phone

### Security

- The connection uses a PIN-based authentication system
- Each session generates a unique access token
- The tunnel is created through `bore.pub` — an open-source tunneling service
- No data is stored on any external server
- You can disconnect all sessions from the desktop app at any time

### What You Can See on Mobile

- Portfolio summary (balance, net worth, P&L)
- All coin holdings with current values
- Recent trade activity
- Module status (which modules are running)
- Connection status and session info

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
