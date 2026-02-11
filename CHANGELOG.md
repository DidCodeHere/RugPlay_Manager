# Changelog

All notable changes to RugPlay Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [2.0.2] — 2026-02-11

Phase 8: Research-Driven Optimization, Sentinel Reliability, and Portfolio UX improvements.

### Added

#### Research & Analysis Pipeline (Phase 8A–8B)

- **Market data collection tooling** — `collect_market_data.py` with 7 collection profiles (default, wide, bluechip, microcap, fresh, movers, comprehensive) and `--all-pages` flag for 10K+ coin sweeps
- **Dataset merger** — `merge_datasets.py` combines multiple collection runs, deduplicates by (symbol, timestamp)
- **Deep analysis engine** — `deep_analysis.py` backtests 216 SL/TP/TS grid configurations per coin across 875 coins (92,873 candle rows, ~189,000 total backtests), outputs `research_manifest.json`
- **RL backtest environment** — Gymnasium-compatible PPO training pipeline via stable-baselines3 with degenerate agent detection (rejects agents that learn trivially-narrow configs)
- **`apply_defaults.py`** — Analyzes RL results, filters degenerate strategies, reports applied vs rejected configs

#### Research Manifest System (Phase 8C)

- **Builtin research manifest** — 875-coin analysis compiled into the Rust binary via `builtin_manifest()`, with disk override support (`research_manifest.json` in app data)
- **`get_research_manifest` command** — Serves the full manifest to the frontend, preferring a user-generated disk version over the compiled-in fallback
- **`get_research_defaults` command** — Returns the balanced sentinel configuration from research for settings reset
- **`get_research_dipbuyer_presets` command** — Returns research-backed DipBuyer presets by aggressiveness level
- **`get_research_about` command** — Aggregated stats, top coins, and tier summaries for the About page
- **`get_doc_content` command** — Serves 8 embedded markdown documents (Features, Architecture, Installation, Building, Security, README, Changelog, Contributing) via `include_str!`
- **`useResearch` hooks** — 4 React hooks (`useResearchManifest`, `useResearchDefaults`, `useResearchDipBuyerPresets`, `useResearchAbout`) for consuming manifest data
- **Research TypeScript types** — `ResearchManifest`, `ResearchSentinelConfig`, `ResearchPerformanceStats`, `ResearchTierBreakdown`, `ResearchTopCoin`, `ResearchAboutData`, and related interfaces

#### About & Guides Page (Phase 8E)

- **About page** — New 8-tab page split into "About" (Overview, Research Data, Best Settings) and "Guides" (Feature Guide, Strategy Guide, Installation, Architecture, Security) groups
- **Overview tab** — Hero banner with research pipeline stats, tier distribution bar charts (MCap and volume tiers), market insight cards (median return, drawdown, pump & dump rate), tech stack grid
- **Research Insights tab** — Tier performance comparison cards, 3 optimal sentinel strategies (Balanced, Best Risk-Adjusted, Best Median P&L), per-tier sentinel configs, top 15 coins table ranked by Sortino ratio
- **Best Settings tab** — Data-driven settings breakdown with reasoning for each parameter, DipBuyer preset comparison across Conservative/Moderate/Aggressive, strategy takeaways
- **Doc Viewer component** — Markdown renderer using `react-markdown` + `remark-gfm` with custom CSS styling for embedded documentation
- **Strategy Guide tab** — Interactive strategy selector (Sentinel, Sniper, Mirror, DipBuyer) with descriptions
- **Sidebar navigation** — Added "About & Guides" nav item with Info icon

#### Reset to Defaults (Phase 8D)

- **`reset_app_settings` command** — Resets sentinel defaults to research-backed balanced config (SL -30%, TP 500%, no trailing stop), batch-updates all existing non-custom sentinels in the database
- **`reset_dipbuyer_config` command** — Regenerates DipBuyer configuration from research presets for the given aggressiveness level, preserves blacklisted coins
- **Settings page reset button** — One-click reset with confirmation banner, applies balanced sentinel config from research data
- **DipBuyer page reset button** — One-click reset with confirmation banner, rebuilds coin tiers and parameters from research presets

#### Sentinel Overhaul (Phase 8A)

- **Positive stop-loss (profit floor)** — Negative SL values protect against losses, positive SL values lock in profit with an activation guard that only fires once price has reached the threshold
- **Unified trigger evaluation** — Extracted `evaluate_sentinel` function into dedicated module, eliminating 3-way trigger logic duplication across sentinel loop, manual check, and DipBuyer sentinel paths
- **`TriggerResult` struct** — Sentinel triggers now return structured data (trigger type, reason string, trigger price) for consistent logging
- **Sentinel event log enrichment** — Trigger logs now include trigger reason, entry price, trigger price, and realized P&L
- **Mirror sentinel fix** — Mirror-created sentinels now use `create_sentinel_for_buy` with the user's actual fill price and configured sell percentage instead of hardcoded values
- **Sniper sell percentage fix** — Sniper-created sentinels now read sell percentage from `sentinel_defaults` setting instead of hardcoding 100%

### Changed

- **Aggressiveness presets updated** — All three DipBuyer presets (Conservative, Moderate, Aggressive) now use research-backed values: Conservative SL -10%/TP 200%, Moderate SL -30%/TP 500%, Aggressive SL -50%/TP 1000%. All presets set trailing stop to off (research finding: trailing stops hurt performance across all tiers)
- **Coin tier MCap boundaries** — Updated to research-derived boundaries: Small ($1K–$10K, 561 coins), Medium ($10K–$100K, 137 coins), Large ($100K–$1M, 72 coins), Mega (>$1M, 104 coins)
- **`DEFAULT_SETTINGS` constant** — Frontend defaults aligned to research balanced config (SL -30%, TP 500%, trailing stop off, auto-manage enabled)
- **Trailing stop removal from defaults** — All presets and default configs now disable trailing stops based on research finding that they consistently reduce returns across every tier and volume category
- **Stop-loss sign normalization** — All default sentinel SL values are explicitly negative to prevent accidental positive-SL (profit floor) activation

### Research Findings

Key statistical outcomes from the 875-coin analysis that drove default changes:

| Metric                      | Value    |
| --------------------------- | -------- |
| Coins analyzed              | 875      |
| Candle rows processed       | 92,873   |
| Grid configs per coin       | 216      |
| Total backtests             | ~189,000 |
| Overall median return       | 522%     |
| Overall median drawdown     | -98.5%   |
| Pump & dump rate            | 34.7%    |
| Coins with positive Sortino | 133      |

**Optimal sentinel configs identified:**

| Strategy           | SL   | TP    | Trailing Stop |
| ------------------ | ---- | ----- | ------------- |
| Balanced (default) | -30% | 500%  | Off           |
| Best Risk-Adjusted | -50% | 1000% | Off           |
| Best Median P&L    | -5%  | 1000% | Off           |

#### Sentinel UX Improvements

- **Coin icons in sentinel table** — Sentinel rows now display the coin's icon image, matching the portfolio and market views
- **Transaction hover tooltips** — Hovering a sentinel row shows a lazy-loaded tooltip with recent buy/sell transactions for that coin, cached per-symbol
- **Search bar** — Filter sentinels by coin symbol in real-time
- **Status filter tabs** — Quick-filter tabs for All, Active, Paused, and Triggered sentinels with count badges
- **Sortable columns** — Click column headers (Coin, Entry Price, Stop Loss, Take Profit, Sell %, Status) to sort ascending/descending with direction indicators
- **Empty state with "Clear filters"** — Shown when search/filter yields no results, with a link to reset
- **"Showing X of Y sentinels"** footer when filtered

#### Portfolio Sentinel Integration

- **Sentinel shield indicator** — Portfolio holdings with active sentinels now display an emerald shield icon next to the coin symbol
- **Shield hover tooltip** — Hovering the shield shows a quick sentinel breakdown: stop loss, take profit, trailing stop, and sell percentage
- **Shield click navigation** — Clicking the shield navigates to the Sentinel page with the search bar pre-filled to that coin's symbol
- **Cross-page state** — `sentinelSearchQuery` state in Dashboard wires the portfolio shield click to the sentinel page's `initialSearch` prop

#### Sentinel Reliability (Bug Fixes)

- **Duplicate sentinel rows** — `list_sentinels` now deduplicates by symbol, preferring active non-triggered entries over triggered ones
- **Instant-trigger on re-buy** — 120-second grace period after sentinel creation prevents immediate triggers when auto-sync creates sentinels with stale entry prices
- **Sentinel fails to sell** — Differentiated error handling: rate limits get short cooldowns, zero-balance coins get auto-triggered, pool-limit errors retry with capped amounts
- **Triggered sentinels never cleaned** — Both periodic cleanup and auto-sync now purge triggered sentinels for coins no longer held
- **Duplicate triggered rows** — New `cleanup_duplicate_triggered` function keeps only the newest triggered sentinel per symbol

### Fixed

- **`navGuardRef` missing declaration** — Added `useRef` initialization in Dashboard.tsx after sentinel search query state addition

---

## [2.0.1] — 2026-02-10

This is the first public stable release. Previous versions (v0.1.0 through v1.2.0) went through extensive private iteration and testing but were never publicly released due to build and runtime issues discovered during QA. This release consolidates all improvements from that development cycle into a single stable package.

### Added

- **Sentinel master container model** — Sentinels now act as a single container per coin, tracking the weighted average entry price across all buys (dip buyer, sniper, mirror, manual). Entry prices automatically stay in sync with the portfolio's server-calculated `avg_purchase_price`
- **`sync_entry_price` persistence function** — Lightweight DB update that syncs only the entry price without touching SL/TP/trailing stop/sell%/custom settings flags
- **Sentinel entry price auto-sync** — Both the background monitor loop (`auto_sync_sentinels`) and the manual sync command now update existing sentinels' entry prices when they drift more than 0.1% from the portfolio average, instead of only creating new sentinels
- **Coin Tiers** — Replaces old market-cap buy tiers with a full per-tier settings system. Each tier defines buy amount, minimum sell value, minimum 24h volume, and maximum buy slippage, with per-tier values of 0 falling back to global settings
- **Signal Analysis Engine** — Four-signal confidence scoring pipeline (sell impact, holder safety, momentum, volume quality) with configurable weights. Hard rejects for whale dumps (>50% mcap), extreme holder concentration (>80%), and excessive slippage
- **Per-tier entry filters** — Dip buyer pipeline resolves matching coin tier after fetching market cap data, applying tier-specific volume requirements, sell value thresholds, and slippage limits
- **Coin page linking on Sentinel** — Sentinel table and detail modal coin symbols are now clickable, navigating to the coin detail page
- **Sentinel `has_custom_settings` flag** — Individual sentinel edits are preserved when batch-applying defaults via "Apply to All"

### Changed

- **Dip buyer sentinel integration** — `create_sentinel_for_dip` now fetches the portfolio's actual `avg_purchase_price` instead of using the latest trade's `response.new_price`, giving correct weighted average entry across multiple dip buys on the same coin
- **Dip buyer sell percentage** — Sentinel creation from dip buyer now respects the user's `sentinelDefaults.sellPercentage` setting instead of hardcoding 100%
- **`upsert_sentinel` UPDATE** — Now updates all sentinel fields (SL/TP/trailing/sell%) on existing sentinels, not just entry price and highest price seen
- `BuyTier` renamed to `CoinTier` across Rust backend and TypeScript frontend, with serde aliases for backward compatibility
- `resolve_buy_amount()` replaced with `resolve_tier()` returning a `ResolvedTierSettings` struct
- Tier editor expanded from 4 columns to 7 columns (+ Min Sell, Min Volume, Max Slippage)
- All three aggressiveness presets updated with meaningful per-tier defaults

### Fixed

- **Sentinel entry price overwrite on repeat buys** — Previously, each dip buy on the same coin would overwrite the sentinel's entry price with the latest trade price, losing the cost basis of earlier buys. Now uses the portfolio's weighted average
- **Auto-sync skipping existing sentinels** — Both background and manual sync paths now update entry prices on existing sentinels instead of silently skipping them
- **Sentinel `upsert_sentinel` partial update bug** — UPDATE query previously only set `entry_price`, `highest_price_seen`, and `is_active`, ignoring SL/TP/trailing stop/sell percentage parameters. All fields are now updated
- Removed unused `std::os::windows::process::CommandExt` imports in mobile server

---

## [1.2.0] — 2026-02-10

### Added

- **Coin Tiers** — Replaces the old market-cap buy tiers with a full per-tier settings system. Each tier can now define its own buy amount, minimum sell value, minimum 24h volume, and maximum buy slippage. Per-tier values of 0 fall back to the global setting
- **Signal Analysis Engine** — Four-signal confidence scoring pipeline (sell impact, holder safety, momentum, volume quality) with configurable weights. Hard rejects for whale dumps (>50% mcap), extreme holder concentration (>80%), and excessive slippage
- **Per-tier entry filters** — The dip buyer pipeline now resolves the matching coin tier after fetching market cap data, applying tier-specific volume requirements, sell value thresholds, and slippage limits instead of using only global values
- **Updated preset values** — All three aggressiveness presets (Conservative, Moderate, Aggressive) now include meaningful per-tier defaults for the new fields

### Changed

- `BuyTier` renamed to `CoinTier` across Rust backend and TypeScript frontend, with serde aliases for backward compatibility with existing stored configs
- `resolve_buy_amount()` replaced with `resolve_tier()` which returns a `ResolvedTierSettings` struct containing all tier-resolved values
- Tier editor in the Strategy tab expanded from 4 columns (Label, Min MCap, Max MCap, Buy Amount) to 7 columns (+ Min Sell, Min Volume, Max Slippage)
- Global min sell value now acts as a quick pre-filter before coin data is fetched; tier-specific min sell value is applied after market cap is known

### Removed

- `BuyTier` struct and `resolve_buy_amount()` method (replaced by `CoinTier` and `resolve_tier()`)
- Unused `std::os::windows::process::CommandExt` imports in mobile server (tokio provides the trait natively)

---

## [1.1.0] — 2025-02-12

### Added

- **Dip Buyer market-cap buy tiers** — Configurable per-tier buy amounts based on coin market cap (later expanded to full Coin Tiers in v1.2.0). Toggle between flat amount and tiered mode with an editable tier table in the UI
- **Sentinel sell verification** — Background sentinel loop now waits for trade confirmation before marking sentinels as triggered. Failed sells are tracked with a retry counter (max 3 failures before auto-deactivation)
- **Sentinel stale cleanup** — Automatic periodic cleanup (every 12 ticks) removes sentinels for coins no longer in portfolio, including previously-triggered sentinels that persisted after selling

### Fixed

- **Sold coins persisting in Sentinel** — Triggered sentinels for coins already sold (e.g. DTMAX showing as "unprotected") are now properly cleaned up. `auto_sync_sentinels` previously only deleted sentinels with `triggered_at IS NULL`, leaving triggered sentinels for sold coins permanently stuck. All sync paths now use `cleanup_stale_sentinels` which removes any sentinel whose coin isn't in the portfolio
- **Sentinel fire-and-forget sells losing failures** — Both `run_sentinel_tick` and `run_sentinel_checks` previously used `submit_trade_fire_and_forget`, marking sentinels as triggered before knowing if the sell succeeded. Now uses `submit_trade` (blocking) and only marks triggered on confirmed success
- **Sentinel sell failure handling** — Failed sells now increment a per-sentinel failure counter. After 3 consecutive failures, the sentinel is auto-deactivated with a notification and SELL_FAILED log entry
- **Manual sentinel check only removing active sentinels** — The `run_sentinel_check` command only removed sentinels where `is_active = true`, leaving triggered sentinels for sold coins. Now uses `cleanup_stale_sentinels` for consistent cleanup across all code paths
- **Sentinel partial sell handling** — Manual check now correctly re-arms sentinels on partial sells (< 100%) instead of always marking them as fully triggered

---

## [1.0.0] — 2026-02-11

### Added

- **User Profiles** — Multi-account support with profile switching, per-profile session tokens, and isolated settings
- **Leaderboard** — Four category views (Top Rugpullers, Biggest Losers, Cash Kings, Paper Millionaires) with search, rank medals, and clickable navigation to user profiles
- **User Profile Pages** — Click any username in Live Feed or holder rows to view their full profile: stats, reputation, created coins, and recent transactions
- **Local Reputation System** — SQLite-backed trust scoring (0-100) with visual indicators. Rug pull reports (-15 pts), rugpuller leaderboard appearances (-5 pts), color-coded badges
- **Dip Buyer restart safety** — `last_tick_ts` persistence and `restore_state_from_log()` prevent duplicate purchases after app restart by rebuilding cooldowns, daily limits, and seen trades from the automation log
- **Dip Buyer dashboard card** — Module status grid expanded to 4 columns with live `dipbuyer-tick` event updates and total bought count
- **DevTools in release builds** — F12 opens the WebView inspector in production builds for debugging

### Changed

- **Cross-platform support** — Application now builds and runs on both Windows and Linux. Mobile server, cloudflared tunnel, and process management use conditional compilation (`#[cfg(windows)]` / `#[cfg(not(windows))]`) for platform-specific APIs
- **UI/UX polish** — Refined dashboard layout, activity feed persistence, and component styling

### Fixed

- **Dip Buyer duplicate purchases on restart** — Three pieces of in-memory state (`seen_trade_keys`, `coin_cooldowns`, `daily_buys`) are now restored from the automation log and persisted tick timestamps on startup
- **TypeScript build errors** — Resolved 6 type errors across 5 frontend files for clean production builds

### Build

- Windows: NSIS installer (6.26 MB) and MSI installer (9.26 MB)
- Linux: deb package (12 MB) and AppImage (82 MB)

---

## [0.3.0] — 2026-02-11

### Added

- **Dip Buyer strategy** — Monitors live trade feed for large sell-offs, verifies the seller isn't a top-N holder, checks volume/mcap/momentum, and auto-buys dips on liquid coins
- **Aggressiveness presets** — One-click Conservative/Moderate/Aggressive profiles that configure buy amount, sell thresholds, holder rank limits, and daily caps
- **Auto-sentinel on dip buys** — Optional automatic sentinel (SL/TP) placement on every dip buy for hands-free risk management
- **Coin blacklist** — Per-symbol blocklist to exclude specific coins from dip buying
- **Automation Log tab** — Centralized persistent feed of all automated actions (sniper, sentinel, mirror, harvester, dip buyer) backed by SQLite
- **`automation_log` SQLite table** — Shared log table with module, symbol, action, amount, and JSON details for every automated trade/event
- **`save_automation_log()` helper** — Shared function used by all five automation modules for consistent logging

### Changed

- Sniper, Sentinel, Mirror, and Harvester modules now write to the centralized `automation_log` table
- Sidebar updated with Dip Buyer and Automation Log navigation items
- Activity feed type union expanded to include `dipbuyer` events

---

## [0.2.0] — 2026-02-10

### Fixed

- **History tab crash** — API responses with string-typed numeric fields and nullable transfer fields no longer cause deserialization errors
- **Sentinel not auto-protecting coins** — Backend monitor now auto-syncs sentinel protection every ~60s, covering manual trades and mirror buys
- **Sniper buying during creator period** — New `min_coin_age_secs` setting (default 65s) prevents buys during the 60-second creator-only window
- **Dashboard activity lost on navigation** — Activity feed persists across tab switches via app-level event store
- **Sniper log lost on navigation** — Snipe log persists across tab switches via same event store
- **bore.pub tunnel fails without retry** — Tunnel establishment retries 3 times with exponential backoff; auto-reconnects on mid-session disconnects
- **Sentinel sell 400 error** — Sell quantities truncated to 8 decimal places before submission, matching the API's precision limit
- **Sentinel partial-sell re-arm** — After a partial sell, the sentinel resets its entry price and tracker so it can fire again for remaining holdings
- **Duplicate notifications** — Notifications now gated through per-category toggles with a master switch

### Changed

- Sniper config now includes "Min Coin Age" setting with UI control
- Sentinel monitor syncs holdings every 6th tick instead of relying on frontend mount
- Activity and snipe events captured globally at app startup
- bore.pub replaced with Cloudflare Quick Tunnels — `cloudflared.exe` auto-downloaded on first use, HTTPS via trycloudflare.com
- Mobile dashboard redesigned with 7-page layout and role-gated navigation
- Desktop mobile page: per-session role dropdowns, kick buttons, default role selector replaces old toggle
- All build warnings cleaned up

### Added

- Persistent activity store for dashboard and sniper log
- Backend `auto_sync_sentinels()` for automatic sentinel management
- Lenient JSON deserializers for Rugplay API quirks
- Role-based mobile access — Viewer (read-only), Trusted (+ sentinels/sniper/activity), Admin (+ trading)
- Mobile session management — kick sessions, change roles, set default role from desktop
- Mobile connection notifications — native desktop toast + Tauri event on device connect/kick
- Expanded mobile API — endpoints for sentinels, sniper status, activity log, trade execution
- Snipe history persistence in SQLite `snipe_log` table
- `rearm_sentinel()` for partial-sell recovery
- Centralized `NotificationHandle` with per-category toggles and `send_raw()`

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
