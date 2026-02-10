//! Sniper — Auto-buy newly created coins
//!
//! Polls the market API sorted by createdAt (newest first) and
//! automatically buys coins matching the user's criteria. Optionally
//! creates a sentinel for auto-protection.

use crate::notifications::NotificationHandle;
use crate::trade_executor::{TradeExecutorHandle, TradePriority};
use crate::AppState;
use crate::save_automation_log;
use rugplay_core::TradeType;
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::{watch, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info};

/// Default polling interval for sniper (seconds)
const DEFAULT_POLL_INTERVAL_SECS: u64 = 15;

// ─── Config ──────────────────────────────────────────────────────────

/// Sniper configuration — persisted to DB settings table
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SniperConfig {
    /// USD amount to buy per snipe
    pub buy_amount_usd: f64,
    /// Only buy coins with market cap below this (0 = no limit)
    pub max_market_cap_usd: f64,
    /// Only buy coins younger than this many seconds (0 = no limit)
    pub max_coin_age_secs: u64,
    /// Automatically create a sentinel after buying
    pub auto_create_sentinel: bool,
    /// Sentinel defaults when auto-creating
    pub stop_loss_pct: f64,
    pub take_profit_pct: f64,
    pub trailing_stop_pct: Option<f64>,
    /// Creators to skip
    pub blacklisted_creators: Vec<String>,
    /// Minimum pool liquidity in USD to buy (0 = no limit)
    #[serde(default)]
    pub min_liquidity_usd: f64,
    /// Maximum USD to spend via sniper per 24h rolling window (0 = unlimited)
    #[serde(default)]
    pub max_daily_spend_usd: f64,
    /// Polling interval in seconds (0 = use default 15s)
    #[serde(default)]
    pub poll_interval_secs: u64,
    /// Minimum coin age in seconds before buying (creator cooldown buffer, default 65s)
    #[serde(default = "default_min_coin_age_secs")]
    pub min_coin_age_secs: u64,
}

fn default_min_coin_age_secs() -> u64 { 65 }

impl Default for SniperConfig {
    fn default() -> Self {
        Self {
            buy_amount_usd: 1000.0,
            max_market_cap_usd: 50_000.0,
            max_coin_age_secs: 300, // 5 minutes
            auto_create_sentinel: true,
            stop_loss_pct: -20.0,
            take_profit_pct: 100.0,
            trailing_stop_pct: Some(15.0),
            blacklisted_creators: Vec::new(),
            min_liquidity_usd: 0.0,    // disabled by default
            max_daily_spend_usd: 0.0,  // unlimited by default
            poll_interval_secs: 0,     // use default 15s
            min_coin_age_secs: 65,     // 60s creator period + 5s buffer
        }
    }
}

// ─── Events ──────────────────────────────────────────────────────────

/// Emitted when a coin is sniped (buy attempt)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SniperTriggeredEvent {
    pub symbol: String,
    pub coin_name: String,
    pub buy_amount_usd: f64,
    pub market_cap: f64,
    pub price: f64,
    pub coin_age_secs: i64,
}

/// Emitted each tick with sniper status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SniperTickEvent {
    pub enabled: bool,
    pub total_sniped: u32,
    pub last_sniped_at: Option<String>,
    pub coins_checked: u32,
}

// ─── Handle ──────────────────────────────────────────────────────────

/// Handle to control the sniper from Tauri commands
#[derive(Clone)]
pub struct SniperHandle {
    enabled_tx: Arc<watch::Sender<bool>>,
    config: Arc<RwLock<SniperConfig>>,
    cancel: CancellationToken,
}

impl SniperHandle {
    pub fn is_enabled(&self) -> bool {
        *self.enabled_tx.borrow()
    }

    pub fn enable(&self) {
        let _ = self.enabled_tx.send(true);
        info!("Sniper enabled");
    }

    pub fn disable(&self) {
        let _ = self.enabled_tx.send(false);
        info!("Sniper disabled");
    }

    pub async fn get_config(&self) -> SniperConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, config: SniperConfig) {
        *self.config.write().await = config;
        info!("Sniper config updated");
    }

    pub fn stop(&self) {
        self.cancel.cancel();
    }
}

// ─── Spawn ───────────────────────────────────────────────────────────

/// Spawn the sniper background task. Returns a handle.
pub fn spawn_sniper(
    app_handle: tauri::AppHandle,
    executor: TradeExecutorHandle,
) -> SniperHandle {
    let (enabled_tx, enabled_rx) = watch::channel(false);
    let config = Arc::new(RwLock::new(SniperConfig::default()));
    let cancel = CancellationToken::new();

    let handle = SniperHandle {
        enabled_tx: Arc::new(enabled_tx),
        config: config.clone(),
        cancel: cancel.clone(),
    };

    // Restore enabled state from DB after a short delay
    let restore_handle = handle.clone();
    let restore_app = app_handle.clone();
    tokio::spawn(async move {
        // Give DB a moment to initialize
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let saved_enabled = load_sniper_enabled(&restore_app).await;
        if saved_enabled {
            restore_handle.enable();
            info!("Sniper: restored enabled state from DB");
        }
    });

    tokio::spawn(sniper_loop(app_handle, enabled_rx, config, executor, cancel));

    handle
}

// ─── Loop ────────────────────────────────────────────────────────────

async fn sniper_loop(
    app_handle: tauri::AppHandle,
    mut enabled_rx: watch::Receiver<bool>,
    config: Arc<RwLock<SniperConfig>>,
    executor: TradeExecutorHandle,
    cancel: CancellationToken,
) {
    info!("Sniper loop started");

    // Track coins we've already sniped to avoid double-buying
    // Now stores (symbol, timestamp) for pruning old entries
    let mut sniped_symbols: HashSet<String> = load_sniped_symbols(&app_handle).await;
    let mut total_sniped: u32 = load_sniper_total(&app_handle).await;
    let mut last_sniped_at: Option<String> = load_sniper_last_at(&app_handle).await;

    // Daily spend tracking for the sniper: (timestamp, usd_amount)
    let mut daily_spend: Vec<(i64, f64)> = Vec::new();

    // Load config from DB
    if let Some(saved_config) = load_sniper_config(&app_handle).await {
        *config.write().await = saved_config;
    }

    // Prune sniped symbols older than 7 days on startup
    prune_old_sniped_symbols(&app_handle, &mut sniped_symbols).await;

    let mut interval = tokio::time::interval(
        std::time::Duration::from_secs(DEFAULT_POLL_INTERVAL_SECS)
    );

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("Sniper cancelled, exiting");
                return;
            }
            _ = interval.tick() => {
                let enabled = *enabled_rx.borrow_and_update();

                if !enabled {
                    // Emit idle tick
                    let tick = SniperTickEvent {
                        enabled: false,
                        total_sniped,
                        last_sniped_at: last_sniped_at.clone(),
                        coins_checked: 0,
                    };
                    let _ = app_handle.emit("sniper-tick", &tick);
                    continue;
                }

                // Get active profile token
                let token = match get_active_token(&app_handle).await {
                    Ok(t) => t,
                    Err(e) => {
                        debug!("Sniper: no active profile: {}", e);
                        continue;
                    }
                };

                let client = RugplayClient::new_with_cache(&token, {
                    let state = app_handle.state::<AppState>();
                    state.coin_cache.clone()
                });
                let cfg = config.read().await.clone();

                // Update interval if config changed
                let desired_interval = if cfg.poll_interval_secs > 0 {
                    cfg.poll_interval_secs
                } else {
                    DEFAULT_POLL_INTERVAL_SECS
                };
                let current_period = interval.period();
                if current_period != std::time::Duration::from_secs(desired_interval) {
                    interval = tokio::time::interval(std::time::Duration::from_secs(desired_interval));
                    info!("Sniper: poll interval updated to {}s", desired_interval);
                }

                // Daily spend check: prune entries > 24h
                let now_epoch = chrono::Utc::now().timestamp();
                daily_spend.retain(|(ts, _)| now_epoch - *ts < 86400);
                let spent_today: f64 = daily_spend.iter().map(|(_, a)| a).sum();

                if cfg.max_daily_spend_usd > 0.0 && spent_today >= cfg.max_daily_spend_usd {
                    debug!("Sniper: daily spend limit reached (${:.2} / ${:.2})", spent_today, cfg.max_daily_spend_usd);
                    let tick = SniperTickEvent {
                        enabled: true,
                        total_sniped,
                        last_sniped_at: last_sniped_at.clone(),
                        coins_checked: 0,
                    };
                    let _ = app_handle.emit("sniper-tick", &tick);
                    continue;
                }

                // Poll newest coins
                match client.get_market(1, 20, "createdAt", "desc", None).await {
                    Ok(market) => {
                        let now = chrono::Utc::now();
                        let mut checked = 0u32;

                        for coin in &market.coins {
                            checked += 1;

                            // Skip if already sniped
                            if sniped_symbols.contains(&coin.symbol) {
                                continue;
                            }

                            // Check market cap filter
                            if cfg.max_market_cap_usd > 0.0 && coin.market_cap > cfg.max_market_cap_usd {
                                continue;
                            }

                            // Check coin age filter (too old)
                            if cfg.max_coin_age_secs > 0 {
                                if let Some(ref created_str) = coin.created_at {
                                    if let Ok(created) = chrono::DateTime::parse_from_rfc3339(created_str) {
                                        let age_secs = (now - created.with_timezone(&chrono::Utc)).num_seconds();
                                        if age_secs > cfg.max_coin_age_secs as i64 {
                                            continue;
                                        }
                                    }
                                }
                            }

                            // Check creator cooldown (too young — within creator-only period)
                            if cfg.min_coin_age_secs > 0 {
                                if let Some(ref created_str) = coin.created_at {
                                    if let Ok(created) = chrono::DateTime::parse_from_rfc3339(created_str) {
                                        let age_secs = (now - created.with_timezone(&chrono::Utc)).num_seconds();
                                        if age_secs < cfg.min_coin_age_secs as i64 {
                                            debug!("Sniper: skipping {} (age {}s < {}s creator cooldown)", 
                                                   coin.symbol, age_secs, cfg.min_coin_age_secs);
                                            continue;
                                        }
                                    }
                                }
                            }

                            // Check blacklisted creators
                            if let Some(ref creator) = coin.creator_name {
                                if cfg.blacklisted_creators.iter().any(|b| b.eq_ignore_ascii_case(creator)) {
                                    debug!("Sniper: skipping {} (blacklisted creator: {})", coin.symbol, creator);
                                    continue;
                                }
                            }

                            // Check remaining daily spend budget
                            if cfg.max_daily_spend_usd > 0.0 && spent_today + cfg.buy_amount_usd > cfg.max_daily_spend_usd {
                                debug!("Sniper: skipping {} (would exceed daily spend limit)", coin.symbol);
                                continue;
                            }

                            // This coin qualifies — SNIPE IT
                            info!("Sniper: targeting {} (mcap: ${:.2}, price: ${:.8})", 
                                coin.symbol, coin.market_cap, coin.current_price);

                            let coin_age = coin.created_at.as_ref()
                                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                .map(|dt| (now - dt.with_timezone(&chrono::Utc)).num_seconds())
                                .unwrap_or(0);

                            // Emit sniper triggered event
                            let event = SniperTriggeredEvent {
                                symbol: coin.symbol.clone(),
                                coin_name: coin.name.clone(),
                                buy_amount_usd: cfg.buy_amount_usd,
                                market_cap: coin.market_cap,
                                price: coin.current_price,
                                coin_age_secs: coin_age,
                            };
                            let _ = app_handle.emit("sniper-triggered", &event);

                            // Submit buy through trade executor
                            let reason = format!(
                                "Sniper: new coin {} (age: {}s, mcap: ${:.0})",
                                coin.symbol, coin_age, coin.market_cap
                            );

                            match executor.submit_trade(
                                coin.symbol.clone(),
                                TradeType::Buy,
                                cfg.buy_amount_usd,
                                TradePriority::High,
                                reason,
                            ).await {
                                Ok(response) => {
                                    info!("Sniper: bought {} @ ${:.8}", coin.symbol, response.new_price);
                                    sniped_symbols.insert(coin.symbol.clone());
                                    total_sniped += 1;
                                    last_sniped_at = Some(chrono::Utc::now().to_rfc3339());

                                    // Track daily spend
                                    daily_spend.push((chrono::Utc::now().timestamp(), cfg.buy_amount_usd));

                                    // Send native notification
                                    if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                                        notif.notify_sniper_buy(&coin.symbol, cfg.buy_amount_usd, response.new_price).await;
                                    }

                                    // Save state (including sniped symbol for restart persistence)
                                    save_sniper_state(&app_handle, total_sniped, last_sniped_at.as_deref()).await;
                                    save_sniped_symbol(&app_handle, &coin.symbol).await;
                                    save_sniped_symbol_timestamp(&app_handle, &coin.symbol).await;

                                    // Persist to snipe_log table
                                    save_snipe_log_entry(
                                        &app_handle,
                                        &coin.symbol,
                                        &coin.name,
                                        cfg.buy_amount_usd,
                                        coin.market_cap,
                                        response.new_price,
                                        coin_age,
                                    ).await;

                                    save_automation_log(
                                        &app_handle,
                                        "sniper",
                                        &coin.symbol,
                                        &coin.name,
                                        "BUY",
                                        cfg.buy_amount_usd,
                                        &serde_json::json!({
                                            "marketCap": coin.market_cap,
                                            "price": response.new_price,
                                            "coinAgeSecs": coin_age,
                                        }).to_string(),
                                    ).await;

                                    // Auto-create sentinel if configured
                                    if cfg.auto_create_sentinel {
                                        if let Some(coins_bought) = response.coins_bought {
                                            create_sentinel_for_snipe(
                                                &app_handle,
                                                &coin.symbol,
                                                response.new_price,
                                                &cfg,
                                            ).await;
                                            debug!("Sniper: sentinel created for {} ({} coins)", coin.symbol, coins_bought);
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!("Sniper: failed to buy {}: {}", coin.symbol, e);
                                    // Don't add to sniped set — allow retry
                                }
                            }
                        }

                        // Emit status tick
                        let tick = SniperTickEvent {
                            enabled: true,
                            total_sniped,
                            last_sniped_at: last_sniped_at.clone(),
                            coins_checked: checked,
                        };
                        let _ = app_handle.emit("sniper-tick", &tick);
                    }
                    Err(e) => {
                        error!("Sniper: failed to fetch market: {}", e);
                    }
                }
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

async fn get_active_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(
            &sqlite::get_profile_token(db.pool(), active_profile.id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Profile token not found")?,
        )
        .map_err(|e| e.to_string())?;

    Ok(token)
}

async fn create_sentinel_for_snipe(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    entry_price: f64,
    config: &SniperConfig,
) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;

    let Some(db) = db_guard.as_ref() else { return };

    let profile = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    if let Err(e) = sqlite::upsert_sentinel(
        db.pool(),
        profile.id,
        symbol,
        Some(config.stop_loss_pct),
        Some(config.take_profit_pct),
        config.trailing_stop_pct,
        100.0,
        entry_price,
    ).await {
        error!("Sniper: failed to create sentinel for {}: {}", symbol, e);
    }
}

// ─── DB Persistence ──────────────────────────────────────────────────

async fn load_sniper_config(app_handle: &tauri::AppHandle) -> Option<SniperConfig> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    let json: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'sniper_config'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()?;

    serde_json::from_str(&json).ok()
}

async fn load_sniper_total(app_handle: &tauri::AppHandle) -> u32 {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return 0 };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'sniper_total_sniped'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0)
}

async fn load_sniper_last_at(app_handle: &tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'sniper_last_sniped_at'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
}

async fn save_sniper_state(app_handle: &tauri::AppHandle, total: u32, last_at: Option<&str>) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let pool = db.pool();

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('sniper_total_sniped', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(total.to_string())
    .execute(pool)
    .await;

    if let Some(at) = last_at {
        let _ = sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('sniper_last_sniped_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1"
        )
        .bind(at)
        .execute(pool)
        .await;
    }
}

/// Save sniper config to DB (called from commands)
pub async fn save_sniper_config(app_handle: &tauri::AppHandle, config: &SniperConfig) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let json = serde_json::to_string(config).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('sniper_config', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(&json)
    .execute(db.pool())
    .await;
}

/// Save whether sniper is enabled to DB
pub async fn save_sniper_enabled(app_handle: &tauri::AppHandle, enabled: bool) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('sniper_enabled', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(if enabled { "true" } else { "false" })
    .execute(db.pool())
    .await;
}

/// Load whether sniper was enabled from DB (for startup restoration)
async fn load_sniper_enabled(app_handle: &tauri::AppHandle) -> bool {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return false };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'sniper_enabled'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false)
}

/// Load sniped symbols from DB to prevent double-buying after restart
async fn load_sniped_symbols(app_handle: &tauri::AppHandle) -> HashSet<String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else {
        return HashSet::new();
    };

    let json: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'sniper_sniped_symbols'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten();

    json.and_then(|j| serde_json::from_str::<Vec<String>>(&j).ok())
        .map(|v| v.into_iter().collect())
        .unwrap_or_default()
}

/// Save a newly sniped symbol to the persistent set
async fn save_sniped_symbol(app_handle: &tauri::AppHandle, symbol: &str) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    // Load existing, add new, save back
    let mut symbols = load_sniped_symbols_from_pool(db.pool()).await;
    symbols.insert(symbol.to_string());

    let json = serde_json::to_string(&symbols.into_iter().collect::<Vec<_>>()).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('sniper_sniped_symbols', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(&json)
    .execute(db.pool())
    .await;
}

/// Internal helper to load from pool directly (avoids re-locking)
async fn load_sniped_symbols_from_pool(pool: &sqlx::SqlitePool) -> HashSet<String> {
    let json: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'sniper_sniped_symbols'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    json.and_then(|j| serde_json::from_str::<Vec<String>>(&j).ok())
        .map(|v| v.into_iter().collect())
        .unwrap_or_default()
}

/// Prune sniped symbols older than 7 days.
/// Uses a separate timestamps store; symbols without timestamps are kept (legacy).
async fn prune_old_sniped_symbols(app_handle: &tauri::AppHandle, sniped: &mut HashSet<String>) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    // Load symbol timestamps: { symbol: epoch_secs }
    let ts_json: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'sniper_sniped_timestamps'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten();

    let mut timestamps: std::collections::HashMap<String, i64> = ts_json
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default();

    let now = chrono::Utc::now().timestamp();
    let seven_days = 7 * 24 * 3600;

    // Remove symbols older than 7 days
    let before = sniped.len();
    timestamps.retain(|_sym, ts| now - *ts < seven_days);
    sniped.retain(|sym| timestamps.contains_key(sym));

    if sniped.len() < before {
        info!("Sniper: pruned {} old sniped symbols (kept {})", before - sniped.len(), sniped.len());

        // Save updated sets
        let symbols_json = serde_json::to_string(&sniped.iter().collect::<Vec<_>>()).unwrap_or_default();
        let _ = sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('sniper_sniped_symbols', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1"
        )
        .bind(&symbols_json)
        .execute(db.pool())
        .await;

        let ts_json_out = serde_json::to_string(&timestamps).unwrap_or_default();
        let _ = sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('sniper_sniped_timestamps', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1"
        )
        .bind(&ts_json_out)
        .execute(db.pool())
        .await;
    }
}

/// Save a sniped symbol with its timestamp for future pruning
async fn save_sniped_symbol_timestamp(app_handle: &tauri::AppHandle, symbol: &str) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    // Load existing timestamps
    let ts_json: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'sniper_sniped_timestamps'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten();

    let mut timestamps: std::collections::HashMap<String, i64> = ts_json
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default();

    timestamps.insert(symbol.to_string(), chrono::Utc::now().timestamp());

    let json = serde_json::to_string(&timestamps).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('sniper_sniped_timestamps', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(&json)
    .execute(db.pool())
    .await;
}

/// Clear all sniped symbols (called from commands)
pub async fn clear_sniped_symbols(app_handle: &tauri::AppHandle) -> u32 {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return 0 };

    let symbols = load_sniped_symbols_from_pool(db.pool()).await;
    let count = symbols.len() as u32;

    let _ = sqlx::query("DELETE FROM settings WHERE key IN ('sniper_sniped_symbols', 'sniper_sniped_timestamps')")
        .execute(db.pool())
        .await;

    info!("Sniper: cleared {} sniped symbols", count);
    count
}

async fn save_snipe_log_entry(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    coin_name: &str,
    buy_amount_usd: f64,
    market_cap: f64,
    price: f64,
    coin_age_secs: i64,
) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let profile = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    let _ = sqlx::query(
        "INSERT INTO snipe_log (profile_id, symbol, coin_name, buy_amount_usd, market_cap, price, coin_age_secs) \
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(profile.id)
    .bind(symbol)
    .bind(coin_name)
    .bind(buy_amount_usd)
    .bind(market_cap)
    .bind(price)
    .bind(coin_age_secs)
    .execute(db.pool())
    .await;

    debug!("Snipe log entry saved for {}", symbol);
}
