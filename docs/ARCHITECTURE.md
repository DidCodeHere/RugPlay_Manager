# Architecture

> Technical deep-dive into RugPlay Manager's codebase for auditors, contributors, and the curious.

[Back to Main README](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Design Principles](#design-principles)
- [Workspace Structure](#workspace-structure)
- [Crate Breakdown](#crate-breakdown)
- [Data Flow](#data-flow)
- [Authentication Model](#authentication-model)
- [Trading Pipeline](#trading-pipeline)
- [Frontend Architecture](#frontend-architecture)
- [Database Schema](#database-schema)
- [Mobile Server](#mobile-server)

---

## Overview

RugPlay Manager is a native Windows desktop application built with:

| Component  | Technology               | Role                                           |
| ---------- | ------------------------ | ---------------------------------------------- |
| Runtime    | Rust + Tokio             | Async task execution, all backend logic        |
| Framework  | Tauri 2.0                | Bridge between native backend and web frontend |
| Frontend   | React + TypeScript       | User interface                                 |
| Styling    | Tailwind CSS + Shadcn UI | Component library and theming                  |
| Database   | SQLite via SQLx          | Local persistent storage                       |
| Encryption | AES-256-GCM + Argon2     | Session token protection                       |
| HTTP       | reqwest                  | API communication with Rugplay                 |

The application emulates browser requests to `rugplay.com`. From the server's perspective, it looks identical to a user interacting with the site normally.

---

## Design Principles

### 1. Browser Emulation

Every HTTP request mirrors what a real browser sends — same headers, same cookie format, same request body structure. We don't use undocumented APIs or exploit server behavior.

### 2. Modular Architecture

The codebase is split into independent crates with clear boundaries. Each crate has a single responsibility and can be tested in isolation.

### 3. Async-First

All I/O operations (HTTP requests, database queries, WebSocket connections) are asynchronous. The Tokio runtime manages concurrent tasks without blocking.

### 4. Security by Default

Session tokens are encrypted at rest. No data leaves the machine except API requests to `rugplay.com`. No telemetry, no analytics, no external dependencies at runtime.

### 5. Deep Nesting

Code is organized into granular submodules rather than flat file structures. This makes it easier to find specific functionality and keeps each file focused.

---

## Workspace Structure

```
rugplay-manager/
├── Cargo.toml                  # Workspace manifest
├── crates/
│   ├── core/                   # Shared data structures
│   ├── networking/             # HTTP client + API wrappers
│   ├── engine/                 # Trading strategies + execution
│   └── persistence/            # Database + encryption
└── gui/
    ├── src-tauri/              # Tauri Rust backend
    └── src/                    # React TypeScript frontend
```

### Dependency Graph

```
                    ┌─────────────────┐
                    │   gui (Tauri)   │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
     ┌────────▼──────┐ ┌───▼────┐ ┌──────▼───────┐
     │    engine     │ │  core  │ │ persistence  │
     └───────┬───────┘ └───▲────┘ └──────┬───────┘
             │             │             │
     ┌───────▼───────┐     │             │
     │  networking   │─────┘             │
     └───────────────┘       ┌───────────┘
                             │
                          rugplay-core
```

---

## Crate Breakdown

### `rugplay-core`

The foundation crate. Contains all shared data structures and type definitions.

**Key modules:**

- `models/coin.rs` — `Coin`, `CoinDetail`, `MarketResponse` structs
- `models/portfolio.rs` — `PortfolioResponse`, `CoinHolding`, `PortfolioSummary`
- `models/market.rs` — `RecentTrade`, `TradeType`, market-related types
- `models/user.rs` — `UserProfile`, `UserStats`
- `errors/` — Custom error types and `Result` aliases

All structs use `serde` for serialization/deserialization. Field names are mapped to camelCase to match the Rugplay API's JSON format:

```rust
#[derive(Deserialize)]
pub struct CoinHolding {
    pub symbol: String,
    #[serde(rename = "currentPrice")]
    pub current_price: f64,
    // ...
}
```

### `rugplay-networking`

Handles all communication with the Rugplay API.

**Key modules:**

- `http/client.rs` — `RugplayClient` struct wrapping `reqwest::Client` with pre-configured headers and cookie management
- `api/` — Typed wrappers for each API endpoint

**Request pattern:**

```rust
// Every request includes:
// - User-Agent mimicking Chrome
// - Accept: application/json
// - Cookie: __Secure-better-auth.session_token={TOKEN}
// - Referer: https://rugplay.com/
```

### `rugplay-engine`

Contains all trading logic and strategy implementations.

**Key modules:**

- `strategies/sniper.rs` — New coin detection and auto-buy logic
- `strategies/sentinel.rs` — Price monitoring, SL/TP/trailing stop execution
- `strategies/mirror.rs` — Whale trade detection and copy-trading
- `risk/` — Position sizing, risk limits, cool-down logic
- `executor/queue.rs` — Trade queue with priority ordering (Moonbag > Sentinel > Mirror > Sniper)

**Important implementation detail:** Sentinel tracks `highest_price_seen` per coin for trailing stops. This value is stored in memory and persisted to the database to survive restarts.

### `rugplay-persistence`

Manages all local data storage and session token encryption.

**Key modules:**

- `sqlite/connection.rs` — SQLx connection pool management
- `sqlite/migrations/` — Database schema migrations
- `encryption/` — AES-256-GCM encryption with machine-bound key derivation

---

## Data Flow

### Buy Order Flow

```
User clicks "Buy"
       │
       ▼
React Component
       │ invoke("buy_coin")
       ▼
Tauri Command Handler (gui/src-tauri/src/commands/)
       │
       ▼
RugplayClient::buy_coin(symbol, amount)  (crates/networking/)
       │
       ▼
POST https://rugplay.com/api/coins/{symbol}/buy
  Headers: Cookie, User-Agent, Content-Type
  Body: { "amount": 100.0 }  (USD amount for buys)
       │
       ▼
Response parsed → Portfolio updated → UI refreshed via Tauri events
```

### Sentinel Monitoring Flow

```
Sentinel Task (spawned via tokio::spawn)
       │
       ▼ loop every N seconds
Fetch current prices for all monitored coins
       │
       ▼
Compare against thresholds:
  - Stop-Loss:    current_price <= entry_price * (1 - sl_pct)
  - Take-Profit:  current_price >= entry_price * (1 + tp_pct)
  - Trailing Stop: current_price <= highest_seen * (1 - trail_pct)
       │
       ▼ threshold hit
Queue sell order → Execute via RugplayClient
       │
       ▼
Emit Tauri event → Frontend shows notification
```

---

## Authentication Model

RugPlay Manager does **not** use OAuth, webhooks, or any form of direct login. Instead, it emulates browser sessions:

1. User provides their `__Secure-better-auth.session_token` cookie value
2. This token is encrypted (AES-256-GCM) with a key derived from the machine's hardware UID
3. For every API request, the token is decrypted in memory and included as a cookie header
4. From Rugplay's server perspective, requests look identical to normal browser activity

This approach means:

- We never handle or see the user's password
- The token works exactly like the user's browser session
- If the user logs out of Rugplay in their browser, the token may be invalidated
- Tokens expire periodically and need to be refreshed

---

## Trading Pipeline

All trade orders flow through a centralized queue:

```
Trade Sources:
  Manual (user click) ──┐
  Sniper (new coin) ────┤
  Mirror (whale copy) ──┤    ┌──────────────┐    ┌──────────────┐
  Sentinel (SL/TP) ─────┼──► │ Trade Queue   │──► │  Executor    │──► Rugplay API
  Moonbag (>5000% ROI) ─┘    │ (priority)    │    │ (sequential) │
                              └──────────────┘    └──────────────┘
```

**Priority order (highest first):**

1. Moonbag — Instant sell for extreme ROI (bypasses queue)
2. Sentinel — Stop-loss executions are time-critical
3. Mirror — Whale copies should be fast to capture similar prices
4. Sniper — New coin buys
5. Manual — User-initiated trades

**Precision handling:** The Rugplay server truncates to 8 decimal places. Before any sell order, we truncate locally:

```rust
let coins_to_sell = (quantity * 1e8).floor() / 1e8;
```

---

## Frontend Architecture

### Component Organization

```
src/components/
├── auth/          # Login screen, token input
├── dashboard/     # DashboardHome with stats cards
├── portfolio/     # Holdings table, sell modals
├── market/        # Coin browser, buy modals
├── feed/          # LiveTrades component
├── sniper/        # Sniper configuration panel
├── sentinel/      # Sentinel management table
├── mirror/        # Whale watchlist, trade log
├── mobile/        # Mobile access setup page
├── settings/      # Tabbed settings (General, Sniper, Sentinel, etc.)
├── trade/         # Shared trade components
└── layout/        # Sidebar, Dashboard shell, routing
```

### State Management

- **Tauri `invoke()`** — Used for request-response queries (fetch portfolio, execute trade)
- **Tauri `listen()`** — Used for real-time events pushed from the Rust backend (price updates, trade notifications, module status changes)
- **React state** — Local component state for UI concerns

### Styling

- **Tailwind CSS** — Utility-first CSS framework
- **Shadcn UI** — Pre-built accessible components (buttons, cards, tables, modals)
- **Dark theme** — Slate/zinc color palette by default. Buy actions use emerald green, sell actions use rose red.

---

## Database Schema

```sql
-- Encrypted session token (AES-256-GCM)
CREATE TABLE auth (
    token_encrypted BLOB NOT NULL,
    iv BLOB NOT NULL,
    last_verified TIMESTAMP
);

-- Cached coin metadata
CREATE TABLE coins (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    icon_url TEXT,
    creator_id TEXT
);

-- Immutable transaction ledger
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,        -- 'BUY' or 'SELL'
    amount REAL NOT NULL,
    price REAL NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current holdings (updated after each trade)
CREATE TABLE holdings (
    symbol TEXT PRIMARY KEY,
    quantity REAL NOT NULL,
    avg_entry_price REAL NOT NULL
);

-- Mirror trading watchlist
CREATE TABLE whales (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    performance_score REAL
);
```

---

## Mobile Server

The mobile access feature embeds a lightweight HTTP server (axum) directly inside the desktop application.

### Components

- **axum HTTP server** — Serves the mobile dashboard HTML/JS and exposes REST API endpoints
- **bore tunnel** — Creates a public TCP tunnel to the local server, making it accessible outside the LAN
- **PIN authentication** — Random 6-digit PIN generated per session
- **Session management** — Token-based sessions with automatic expiry

### Endpoints

| Route            | Method | Auth  | Purpose                                              |
| ---------------- | ------ | :---: | ---------------------------------------------------- |
| `/`              | GET    |  No   | Serves the mobile dashboard HTML                     |
| `/app.js`        | GET    |  No   | Serves the mobile dashboard JavaScript               |
| `/api/auth`      | POST   |  PIN  | Authenticate with 6-digit PIN, receive session token |
| `/api/portfolio` | GET    | Token | Fetch portfolio data                                 |
| `/api/modules`   | GET    | Token | Fetch module status                                  |
| `/api/trades`    | GET    | Token | Fetch recent trade history                           |

### Architecture

```
Phone Browser
     │
     ▼ HTTPS via bore tunnel
bore.pub:PORT
     │
     ▼ TCP forwarded to localhost
axum HTTP Server (inside Tauri app)
     │
     ▼ reads from
Local SQLite Database + Rugplay API
```

The mobile dashboard is a self-contained HTML/CSS/JS application embedded in the Rust binary via `include_str!()`. No external CDN dependencies, no framework — pure vanilla JavaScript.

---

[Back to Main README](../README.md)
