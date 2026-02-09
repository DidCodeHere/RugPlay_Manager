# Changelog

All notable changes to RugPlay Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-02-09

### Added

- **Dashboard** — Real-time portfolio overview with balance, net worth, P&L, and module status
- **Portfolio View** — Detailed holdings breakdown with per-coin P&L, cost basis, and sell actions
- **Market Browser** — Full coin marketplace with search, sort, filter, and one-click trading
- **Live Feed** — Real-time trade activity across the entire Rugplay platform
- **Sniper Bot** — Automatic purchase of newly launched coins with configurable buy amount
- **Sentinel** — Automated Stop-Loss, Take-Profit, and Trailing Stop protection for all holdings
- **Mirror Trading** — Copy trades from whale traders, scaled proportionally to your bankroll
- **Harvester** — Automatic 12-hour reward claiming
- **Mobile Remote Access** — Monitor your bot from any device via secure tunnel with PIN auth
- **Settings** — Per-module configuration with tabbed interface (General, Sniper, Sentinel, Mirror, Risk, Notifications)
- **Session Encryption** — AES-256-GCM encryption for session tokens with machine-bound key derivation
- **Local Database** — SQLite storage for holdings, transactions, settings, and whale watchlist
- **Dark Theme** — Slate/zinc palette with emerald (buy) and rose (sell) accents
- **Responsive Sidebar** — Collapsible navigation with module status indicators

### Security

- All session tokens encrypted at rest using AES-256-GCM
- Machine-specific encryption keys derived via Argon2
- No telemetry, analytics, or external data transmission
- Full source code available for audit

---

[Back to Main README](README.md)
