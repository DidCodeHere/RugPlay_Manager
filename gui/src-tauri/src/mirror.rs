//! Mirror — Copy whale trades in real-time
//!
//! Polls the live trade feed and detects trades by tracked whales.
//! Copies trades with a configurable scale factor and max trade size.
//! Optionally creates sentinels for bought coins.

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
use tracing::{debug, error, info, warn};

/// Default polling interval for mirror (seconds)
const DEFAULT_POLL_INTERVAL_SECS: u64 = 10;

// ─── Config ──────────────────────────────────────────────────────────

/// Mirror configuration — persisted to DB settings table
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorConfig {
    /// Percentage of whale trade size to copy (0.01 = 1%, 1.0 = 100%)
    pub scale_factor: f64,
    /// Maximum USD per copied trade (0 = no limit)
    pub max_trade_usd: f64,
    /// Maximum latency in seconds before skipping a trade
    pub max_latency_secs: f64,
    /// Automatically create a sentinel after buying mirrored coin
    pub auto_create_sentinel: bool,
    /// Sentinel defaults when auto-creating
    pub stop_loss_pct: f64,
    pub take_profit_pct: f64,
    pub trailing_stop_pct: Option<f64>,
    /// Percentage of holdings to sell when sentinel triggers (default 100%)
    #[serde(default = "default_sell_pct")]
    pub sell_percentage: f64,
    /// Skip BUY if user already holds the coin
    #[serde(default = "default_true")]
    pub skip_if_already_held: bool,
    /// Polling interval in seconds (0 = use default 10s)
    #[serde(default)]
    pub poll_interval_secs: u64,
}

fn default_true() -> bool { true }
fn default_sell_pct() -> f64 { 100.0 }

impl Default for MirrorConfig {
    fn default() -> Self {
        Self {
            scale_factor: 0.10,       // 10% of whale trade
            max_trade_usd: 5000.0,    // Cap at $5000
            max_latency_secs: 5.0,    // Skip if trade is >5s old
            auto_create_sentinel: true,
            stop_loss_pct: -25.0,
            take_profit_pct: 100.0,
            trailing_stop_pct: Some(15.0),
            sell_percentage: 100.0,
            skip_if_already_held: true,
            poll_interval_secs: 0,    // use default 10s
        }
    }
}

// ─── Events ──────────────────────────────────────────────────────────

/// Emitted when a whale trade is detected and mirrored
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorTriggeredEvent {
    pub whale_username: String,
    pub whale_user_id: String,
    pub coin_symbol: String,
    pub coin_name: String,
    pub whale_amount_usd: f64,
    pub our_amount_usd: f64,
    pub trade_type: String,
    pub latency_secs: f64,
}

/// Emitted each tick with mirror status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorTickEvent {
    pub enabled: bool,
    pub tracked_whale_count: u32,
    pub total_mirrored: u32,
    pub last_mirrored_at: Option<String>,
    pub trades_checked: u32,
}

/// A record of a mirrored trade (kept in-memory for the session)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorTradeRecord {
    pub whale_username: String,
    pub whale_user_id: String,
    pub coin_symbol: String,
    pub coin_name: String,
    pub trade_type: String,
    pub whale_amount_usd: f64,
    pub our_amount_usd: f64,
    pub timestamp: String,
    pub success: bool,
}

// ─── Handle ──────────────────────────────────────────────────────────

/// Handle to control the mirror from Tauri commands
#[derive(Clone)]
pub struct MirrorHandle {
    enabled_tx: Arc<watch::Sender<bool>>,
    config: Arc<RwLock<MirrorConfig>>,
    /// Set of tracked whale user_ids (synced from DB)
    tracked_whales: Arc<RwLock<HashSet<String>>>,
    /// History of mirrored trades (session-only, for UI display)
    trade_history: Arc<RwLock<Vec<MirrorTradeRecord>>>,
    cancel: CancellationToken,
}

impl MirrorHandle {
    pub fn is_enabled(&self) -> bool {
        *self.enabled_tx.borrow()
    }

    pub fn enable(&self) {
        let _ = self.enabled_tx.send(true);
        info!("Mirror enabled");
    }

    pub fn disable(&self) {
        let _ = self.enabled_tx.send(false);
        info!("Mirror disabled");
    }

    pub async fn get_config(&self) -> MirrorConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, config: MirrorConfig) {
        *self.config.write().await = config;
        info!("Mirror config updated");
    }

    pub async fn add_whale(&self, user_id: String) {
        self.tracked_whales.write().await.insert(user_id);
    }

    pub async fn remove_whale(&self, user_id: &str) {
        self.tracked_whales.write().await.remove(user_id);
    }

    pub async fn get_tracked_whale_ids(&self) -> HashSet<String> {
        self.tracked_whales.read().await.clone()
    }

    pub async fn get_trade_history(&self) -> Vec<MirrorTradeRecord> {
        self.trade_history.read().await.clone()
    }

    pub async fn add_trade_record(&self, record: MirrorTradeRecord) {
        let mut history = self.trade_history.write().await;
        history.push(record);
        // Keep last 200 records
        if history.len() > 200 {
            let drain = history.len() - 200;
            history.drain(..drain);
        }
    }

    pub fn stop(&self) {
        self.cancel.cancel();
    }
}

// ─── Spawn ───────────────────────────────────────────────────────────

/// Spawn the mirror background task. Returns a handle.
pub fn spawn_mirror(
    app_handle: tauri::AppHandle,
    executor: TradeExecutorHandle,
) -> MirrorHandle {
    let (enabled_tx, enabled_rx) = watch::channel(false);
    let config = Arc::new(RwLock::new(MirrorConfig::default()));
    let tracked_whales = Arc::new(RwLock::new(HashSet::new()));
    let trade_history = Arc::new(RwLock::new(Vec::new()));
    let cancel = CancellationToken::new();

    let handle = MirrorHandle {
        enabled_tx: Arc::new(enabled_tx),
        config: config.clone(),
        tracked_whales: tracked_whales.clone(),
        trade_history: trade_history.clone(),
        cancel: cancel.clone(),
    };

    // Load tracked whales from DB after a short delay
    let restore_handle = handle.clone();
    let restore_app = app_handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        // Load saved enabled state
        let saved_enabled = load_mirror_enabled(&restore_app).await;
        if saved_enabled {
            restore_handle.enable();
            info!("Mirror: restored enabled state from DB");
        }

        // Load saved config
        if let Some(saved_config) = load_mirror_config(&restore_app).await {
            restore_handle.set_config(saved_config).await;
        }

        // Load tracked whales from DB
        load_whales_from_db(&restore_app, &restore_handle).await;
    });

    tokio::spawn(mirror_loop(
        app_handle,
        enabled_rx,
        config,
        tracked_whales,
        trade_history,
        executor,
        cancel,
    ));

    handle
}

// ─── Loop ────────────────────────────────────────────────────────────

async fn mirror_loop(
    app_handle: tauri::AppHandle,
    mut enabled_rx: watch::Receiver<bool>,
    config: Arc<RwLock<MirrorConfig>>,
    tracked_whales: Arc<RwLock<HashSet<String>>>,
    trade_history: Arc<RwLock<Vec<MirrorTradeRecord>>>,
    executor: TradeExecutorHandle,
    cancel: CancellationToken,
) {
    info!("Mirror loop started");

    // Track already-seen trade keys with timestamps for LRU eviction
    // Key: "{user_id}:{coin_symbol}:{timestamp}:{trade_type}" -> epoch_seen
    let mut seen_trades: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut total_mirrored: u32 = load_mirror_total(&app_handle).await;
    let mut last_mirrored_at: Option<String> = load_mirror_last_at(&app_handle).await;

    let mut interval = tokio::time::interval(
        std::time::Duration::from_secs(DEFAULT_POLL_INTERVAL_SECS),
    );

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("Mirror cancelled, exiting");
                return;
            }
            _ = interval.tick() => {
                let enabled = *enabled_rx.borrow_and_update();

                let whale_ids = tracked_whales.read().await.clone();

                if !enabled || whale_ids.is_empty() {
                    // Emit idle tick
                    let tick = MirrorTickEvent {
                        enabled,
                        tracked_whale_count: whale_ids.len() as u32,
                        total_mirrored,
                        last_mirrored_at: last_mirrored_at.clone(),
                        trades_checked: 0,
                    };
                    let _ = app_handle.emit("mirror-tick", &tick);
                    continue;
                }

                // Get active profile's client
                let client = match get_active_client(&app_handle).await {
                    Some(c) => c,
                    None => {
                        debug!("Mirror: no active profile, skipping tick");
                        continue;
                    }
                };

                // Fetch recent trades from live feed
                let trades = match client.get_recent_trades(50).await {
                    Ok(t) => t,
                    Err(e) => {
                        warn!("Mirror: failed to fetch recent trades: {}", e);
                        continue;
                    }
                };

                // Filter out transfers — only mirror actual BUY/SELL trades
                let trades: Vec<_> = trades
                    .into_iter()
                    .filter(|t| {
                        let tt = t.trade_type.to_uppercase();
                        tt == "BUY" || tt == "SELL"
                    })
                    .collect();

                let now = chrono::Utc::now().timestamp();
                let cfg = config.read().await.clone();
                let mut trades_checked: u32 = 0;

                // Update interval from config
                let desired_interval = if cfg.poll_interval_secs > 0 {
                    cfg.poll_interval_secs
                } else {
                    DEFAULT_POLL_INTERVAL_SECS
                };
                let current_period = interval.period();
                if current_period != std::time::Duration::from_secs(desired_interval) {
                    interval = tokio::time::interval(std::time::Duration::from_secs(desired_interval));
                    info!("Mirror: poll interval updated to {}s", desired_interval);
                }

                // Fetch current holdings to check skip_if_already_held
                let held_symbols: HashSet<String> = if cfg.skip_if_already_held {
                    match client.get_portfolio().await {
                        Ok(portfolio) => portfolio.coin_holdings.iter().map(|h| h.symbol.clone()).collect(),
                        Err(e) => {
                            debug!("Mirror: couldn't fetch portfolio for holdings check: {}", e);
                            HashSet::new()
                        }
                    }
                } else {
                    HashSet::new()
                };

                for trade in &trades {
                    trades_checked += 1;

                    // Check if this trade is from a tracked whale
                    if !whale_ids.contains(&trade.user_id) {
                        continue;
                    }

                    // Deduplicate: skip if we've already processed this exact trade
                    let trade_key = format!(
                        "{}:{}:{}:{}",
                        trade.user_id, trade.coin_symbol, trade.timestamp, trade.trade_type
                    );
                    if seen_trades.contains_key(&trade_key) {
                        continue;
                    }

                    // Check latency — skip if trade is too old
                    let trade_age_secs = (now - trade.timestamp) as f64;
                    if trade_age_secs > cfg.max_latency_secs {
                        debug!(
                            "Mirror: skipping old whale trade from {} — {:.1}s old (max {:.1}s)",
                            trade.username, trade_age_secs, cfg.max_latency_secs
                        );
                        // Still mark as seen so we don't re-process next tick
                        seen_trades.insert(trade_key, now);
                        continue;
                    }

                    // Skip if user already holds this coin (for BUY trades)
                    if trade.is_buy() && cfg.skip_if_already_held && held_symbols.contains(&trade.coin_symbol) {
                        debug!("Mirror: skipping BUY of {} (already held)", trade.coin_symbol);
                        seen_trades.insert(trade_key, now);
                        continue;
                    }

                    // Calculate scaled amount
                    let scaled_usd = trade.total_value * cfg.scale_factor;
                    let capped_usd = if cfg.max_trade_usd > 0.0 {
                        scaled_usd.min(cfg.max_trade_usd)
                    } else {
                        scaled_usd
                    };

                    // Skip very small trades
                    if capped_usd < 1.0 {
                        seen_trades.insert(trade_key.clone(), now);
                        continue;
                    }

                    info!(
                        "Mirror: Whale {} {} ${:.2} of {} — copying ${:.2} (scale {:.0}%)",
                        trade.username,
                        trade.trade_type,
                        trade.total_value,
                        trade.coin_symbol,
                        capped_usd,
                        cfg.scale_factor * 100.0,
                    );

                    // Determine trade type
                    let trade_type = if trade.is_buy() {
                        TradeType::Buy
                    } else {
                        TradeType::Sell
                    };

                    // For SELL trades, we need coin amount not USD
                    // For BUY trades, API expects USD amount
                    let amount = match trade_type {
                        TradeType::Buy => capped_usd,
                        TradeType::Sell => {
                            // Calculate coin amount from USD value and price
                            if trade.price > 0.0 {
                                let coins = capped_usd / trade.price;
                                // Truncate to 8 decimals (server precision)
                                (coins * 1e8).floor() / 1e8
                            } else {
                                warn!("Mirror: price is 0 for sell, skipping");
                                seen_trades.insert(trade_key, now);
                                continue;
                            }
                        }
                    };

                    // Submit trade through executor
                    let reason = format!(
                        "Mirror: copying {} {} ${:.2} of {}",
                        trade.username, trade.trade_type, trade.total_value, trade.coin_symbol
                    );

                    let success = match executor
                        .submit_trade(
                            trade.coin_symbol.clone(),
                            trade_type.clone(),
                            amount,
                            TradePriority::Normal,
                            reason,
                        )
                        .await
                    {
                        Ok(_resp) => {
                            info!(
                                "Mirror: successfully mirrored {} {} ${:.2} of {}",
                                trade.username, trade.trade_type, capped_usd, trade.coin_symbol
                            );
                            save_automation_log(
                                &app_handle,
                                "mirror",
                                &trade.coin_symbol,
                                &trade.coin_name,
                                &trade.trade_type.to_uppercase(),
                                capped_usd,
                                &serde_json::json!({
                                    "whaleUsername": trade.username,
                                    "whaleAmountUsd": trade.total_value,
                                }).to_string(),
                            ).await;
                            true
                        }
                        Err(e) => {
                            error!(
                                "Mirror: failed to execute mirrored trade for {}: {}",
                                trade.coin_symbol, e
                            );
                            false
                        }
                    };

                    // Record the mirrored trade
                    let record = MirrorTradeRecord {
                        whale_username: trade.username.clone(),
                        whale_user_id: trade.user_id.clone(),
                        coin_symbol: trade.coin_symbol.clone(),
                        coin_name: trade.coin_name.clone(),
                        trade_type: trade.trade_type.clone(),
                        whale_amount_usd: trade.total_value,
                        our_amount_usd: capped_usd,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        success,
                    };

                    // Store in history
                    {
                        let mut history = trade_history.write().await;
                        history.push(record.clone());
                        if history.len() > 200 {
                            let drain = history.len() - 200;
                            history.drain(..drain);
                        }
                    }

                    // Emit event to frontend
                    let event = MirrorTriggeredEvent {
                        whale_username: trade.username.clone(),
                        whale_user_id: trade.user_id.clone(),
                        coin_symbol: trade.coin_symbol.clone(),
                        coin_name: trade.coin_name.clone(),
                        whale_amount_usd: trade.total_value,
                        our_amount_usd: capped_usd,
                        trade_type: trade.trade_type.clone(),
                        latency_secs: trade_age_secs,
                    };
                    let _ = app_handle.emit("mirror-triggered", &event);

                    // Send notification
                    if let Some(notif) = try_notify(&app_handle) {
                        let trade_type_str = if trade.is_buy() { "BUY" } else { "SELL" };
                        notif
                            .notify_trade_executed(
                                &trade.coin_symbol,
                                &format!("Mirror {}", trade_type_str),
                                capped_usd,
                            )
                            .await;
                    }

                    // Auto-create sentinel for buys
                    if success && trade.is_buy() && cfg.auto_create_sentinel {
                        create_auto_sentinel(
                            &app_handle,
                            &trade.coin_symbol,
                            trade.price,
                            cfg.stop_loss_pct,
                            cfg.take_profit_pct,
                            cfg.trailing_stop_pct,
                            cfg.sell_percentage,
                        )
                        .await;
                    }

                    // Mark as seen
                    seen_trades.insert(trade_key, now);

                    total_mirrored += 1;
                    last_mirrored_at = Some(chrono::Utc::now().to_rfc3339());

                    // Persist stats
                    save_mirror_total(&app_handle, total_mirrored).await;
                    save_mirror_last_at(&app_handle, last_mirrored_at.as_deref().unwrap_or(""))
                        .await;
                }

                // LRU eviction: remove entries older than 1 hour (instead of clearing all)
                if seen_trades.len() > 500 {
                    let one_hour_ago = now - 3600;
                    seen_trades.retain(|_, ts| *ts > one_hour_ago);
                    debug!("Mirror: evicted old seen_trades, {} remaining", seen_trades.len());
                }

                // Emit tick event
                let tick = MirrorTickEvent {
                    enabled: true,
                    tracked_whale_count: whale_ids.len() as u32,
                    total_mirrored,
                    last_mirrored_at: last_mirrored_at.clone(),
                    trades_checked,
                };
                let _ = app_handle.emit("mirror-tick", &tick);
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/// Try to get the NotificationHandle without panicking
fn try_notify(app_handle: &tauri::AppHandle) -> Option<crate::notifications::NotificationHandle> {
    app_handle
        .try_state::<crate::notifications::NotificationHandle>()
        .map(|s| s.inner().clone())
}

/// Get an authenticated client for the active profile
async fn get_active_client(app_handle: &tauri::AppHandle) -> Option<RugplayClient> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;
    let pool = db.pool();

    // Get active profile
    let profiles = sqlite::list_profiles(pool).await.ok()?;
    let active = profiles.into_iter().find(|p| p.is_active)?;

    // Get encrypted token and decrypt
    let encrypted = sqlite::get_profile_token(pool, active.id).await.ok()??;
    let token = state.encryptor.decrypt(&encrypted).ok()?;

    Some(RugplayClient::new_with_cache(&token, state.coin_cache.clone()))
}

/// Create a sentinel for a mirrored buy
async fn create_auto_sentinel(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    entry_price: f64,
    stop_loss_pct: f64,
    take_profit_pct: f64,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = match db_guard.as_ref() {
        Some(d) => d,
        None => return,
    };
    let pool = db.pool();

    let active = match sqlite::get_active_profile(pool).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    if let Err(e) = sqlite::upsert_sentinel(
        pool,
        active.id,
        symbol,
        Some(stop_loss_pct),
        Some(take_profit_pct),
        trailing_stop_pct,
        sell_percentage,
        entry_price,
    )
    .await
    {
        error!("Mirror: failed to auto-create sentinel for {}: {}", symbol, e);
    } else {
        info!("Mirror: auto-created sentinel for {} at entry ${:.8}", symbol, entry_price);
    }
}

/// Load tracked whales from DB into the handle
async fn load_whales_from_db(app_handle: &tauri::AppHandle, handle: &MirrorHandle) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = match db_guard.as_ref() {
        Some(d) => d,
        None => return,
    };

    match sqlite::list_whales(db.pool()).await {
        Ok(whales) => {
            let mut ids = handle.tracked_whales.write().await;
            for w in &whales {
                ids.insert(w.user_id.clone());
            }
            info!("Mirror: loaded {} tracked whales from DB", whales.len());
        }
        Err(e) => {
            error!("Mirror: failed to load whales from DB: {}", e);
        }
    }
}

// ─── Settings persistence ────────────────────────────────────────────

pub async fn save_mirror_enabled(app_handle: &tauri::AppHandle, enabled: bool) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        let _ = sqlx::query(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('mirror_enabled', ?)",
        )
        .bind(if enabled { "true" } else { "false" })
        .execute(db.pool())
        .await;
    }
}

async fn load_mirror_enabled(app_handle: &tauri::AppHandle) -> bool {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'mirror_enabled'",
        )
        .fetch_optional(db.pool())
        .await
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false)
    } else {
        false
    }
}

pub async fn save_mirror_config(app_handle: &tauri::AppHandle, config: &MirrorConfig) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        if let Ok(json) = serde_json::to_string(config) {
            let _ = sqlx::query(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('mirror_config', ?)",
            )
            .bind(&json)
            .execute(db.pool())
            .await;
        }
    }
}

async fn load_mirror_config(app_handle: &tauri::AppHandle) -> Option<MirrorConfig> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    let json = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'mirror_config'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()??;

    serde_json::from_str(&json).ok()
}

async fn load_mirror_total(app_handle: &tauri::AppHandle) -> u32 {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'mirror_total_mirrored'",
        )
        .fetch_optional(db.pool())
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
    } else {
        0
    }
}

async fn save_mirror_total(app_handle: &tauri::AppHandle, total: u32) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        let _ = sqlx::query(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('mirror_total_mirrored', ?)",
        )
        .bind(total.to_string())
        .execute(db.pool())
        .await;
    }
}

async fn load_mirror_last_at(app_handle: &tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'mirror_last_mirrored_at'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()?
}

async fn save_mirror_last_at(app_handle: &tauri::AppHandle, at: &str) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        let _ = sqlx::query(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('mirror_last_mirrored_at', ?)",
        )
        .bind(at)
        .execute(db.pool())
        .await;
    }
}
