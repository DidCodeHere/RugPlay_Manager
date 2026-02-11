//! Background Sentinel Monitor Loop
//!
//! A persistent Tokio task that automatically monitors sentinel conditions
//! (SL/TP/trailing stops) by polling portfolio prices on a configurable interval.
//! Submits triggered sells through the TradeExecutor queue.

use crate::notifications::NotificationHandle;
use crate::sentinel_eval::evaluate_sentinel;
use crate::trade_executor::{TradeExecutorHandle, TradePriority};
use crate::AppState;
use crate::save_automation_log;
use rugplay_core::{TradeType, truncate_to_8_decimals};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

/// Default polling interval in seconds
const DEFAULT_INTERVAL_SECS: u64 = 10;

/// Cooldown in seconds after a SUCCESSFUL sell before re-checking (per symbol)
const TRIGGER_COOLDOWN_SECS: i64 = 30;

/// Shorter cooldown for failed sells so retries happen sooner
const FAILED_COOLDOWN_SECS: i64 = 12;

/// How often (in ticks) to run a full portfolio sync for auto-protection
const SYNC_EVERY_N_TICKS: u32 = 6;

/// How often (in ticks) to run a stale sentinel cleanup
const CLEANUP_EVERY_N_TICKS: u32 = 12;

/// Max consecutive sell failures before deactivating a sentinel to prevent spam
const MAX_SELL_FAILURES: u32 = 3;

/// Maximum fraction of pool tokens the server allows selling (99.5%)
const MAX_POOL_SELL_FRACTION: f64 = 0.99;

/// Grace period in seconds after sentinel creation before it can trigger.
/// Prevents instant triggers when auto-sync creates sentinels with stale entry prices.
const CREATION_GRACE_SECS: i64 = 120;

/// Status of the sentinel monitor
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MonitorStatus {
    Running,
    Paused,
    Stopped,
}

/// Event emitted when a sentinel triggers
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelTriggeredEvent {
    pub sentinel_id: i64,
    pub symbol: String,
    pub reason: String,
    pub trigger_type: String, // "stop_loss", "take_profit", "trailing_stop"
    pub current_price: f64,
    pub entry_price: f64,
    pub sell_amount: f64,
    pub sell_percentage: f64,
}

/// Event emitted on each monitor tick with summary info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelTickEvent {
    pub status: MonitorStatus,
    pub checked: u32,
    pub active_count: u32,
    pub last_check_at: String,
}

/// Handle to control the sentinel monitor from Tauri commands
#[derive(Clone)]
pub struct SentinelMonitorHandle {
    pause_tx: watch::Sender<bool>,
    cancel_token: CancellationToken,
    status: Arc<tokio::sync::RwLock<MonitorStatus>>,
    interval_secs: Arc<tokio::sync::RwLock<u64>>,
}

impl SentinelMonitorHandle {
    /// Pause the monitor (it will stop checking but the task stays alive)
    pub async fn pause(&self) {
        let _ = self.pause_tx.send(true);
        *self.status.write().await = MonitorStatus::Paused;
        info!("Sentinel monitor paused");
    }

    /// Resume the monitor
    pub async fn resume(&self) {
        let _ = self.pause_tx.send(false);
        *self.status.write().await = MonitorStatus::Running;
        info!("Sentinel monitor resumed");
    }

    /// Stop the monitor entirely (cannot be restarted — must spawn a new one)
    pub async fn stop(&self) {
        self.cancel_token.cancel();
        *self.status.write().await = MonitorStatus::Stopped;
        info!("Sentinel monitor stopped");
    }

    /// Get current status
    pub async fn status(&self) -> MonitorStatus {
        *self.status.read().await
    }

    /// Check if paused
    pub async fn is_paused(&self) -> bool {
        *self.pause_tx.borrow()
    }

    /// Update polling interval
    pub async fn set_interval(&self, secs: u64) {
        *self.interval_secs.write().await = secs;
        info!("Sentinel monitor interval set to {}s", secs);
    }

    /// Get current polling interval
    pub async fn get_interval(&self) -> u64 {
        *self.interval_secs.read().await
    }
}

/// Spawn the sentinel monitor background task.
///
/// Returns a handle to control pause/resume/stop.
pub fn spawn_sentinel_monitor(
    app_handle: tauri::AppHandle,
    executor_handle: TradeExecutorHandle,
) -> SentinelMonitorHandle {
    let (pause_tx, pause_rx) = watch::channel(false); // starts unpaused
    let cancel_token = CancellationToken::new();
    let status = Arc::new(tokio::sync::RwLock::new(MonitorStatus::Running));
    let interval_secs = Arc::new(tokio::sync::RwLock::new(DEFAULT_INTERVAL_SECS));

    let handle = SentinelMonitorHandle {
        pause_tx,
        cancel_token: cancel_token.clone(),
        status: status.clone(),
        interval_secs: interval_secs.clone(),
    };

    tokio::spawn(sentinel_monitor_loop(
        app_handle,
        executor_handle,
        pause_rx,
        cancel_token,
        status,
        interval_secs,
    ));

    handle
}

/// The main sentinel monitor loop
async fn sentinel_monitor_loop(
    app_handle: tauri::AppHandle,
    executor_handle: TradeExecutorHandle,
    mut pause_rx: watch::Receiver<bool>,
    cancel_token: CancellationToken,
    status: Arc<tokio::sync::RwLock<MonitorStatus>>,
    interval_secs: Arc<tokio::sync::RwLock<u64>>,
) {
    info!("Sentinel monitor started (interval: {}s)", DEFAULT_INTERVAL_SECS);

    // Give the app a moment to initialize DB and login
    tokio::time::sleep(Duration::from_secs(3)).await;

    // Track cooldown per symbol: symbol -> epoch when cooldown expires
    let mut trigger_cooldowns: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut tick_counter: u32 = 0;
    // Track consecutive sell failures per sentinel to prevent infinite retry spam
    let mut sell_failures: std::collections::HashMap<i64, u32> = std::collections::HashMap::new();

    loop {
        let current_interval = *interval_secs.read().await;

        tokio::select! {
            _ = cancel_token.cancelled() => {
                info!("Sentinel monitor cancelled, exiting");
                break;
            }
            _ = tokio::time::sleep(Duration::from_secs(current_interval)) => {
                // Check if paused
                if *pause_rx.borrow() {
                    debug!("Sentinel monitor is paused, skipping tick");
                    continue;
                }

                // Run a sentinel check
                match run_sentinel_tick(&app_handle, &executor_handle, &mut trigger_cooldowns, &mut tick_counter, &mut sell_failures).await {
                    Ok(tick) => {
                        debug!(
                            "Sentinel tick: checked={}, active={}",
                            tick.checked, tick.active_count
                        );
                        // Emit tick event to frontend
                        if let Err(e) = app_handle.emit("sentinel-tick", &tick) {
                            warn!("Failed to emit sentinel-tick event: {}", e);
                        }
                    }
                    Err(e) => {
                        // Don't spam errors if user just hasn't logged in yet
                        if !e.contains("No active profile") && !e.contains("Database not initialized") {
                            error!("Sentinel tick error: {}", e);
                        } else {
                            debug!("Sentinel tick skipped: {}", e);
                        }
                    }
                }
            }
            // Also wake up when pause state changes (so resume takes effect immediately)
            _ = pause_rx.changed() => {
                let paused = *pause_rx.borrow();
                if paused {
                    debug!("Sentinel monitor pause signal received");
                } else {
                    debug!("Sentinel monitor resume signal received");
                }
                continue;
            }
        }
    }

    *status.write().await = MonitorStatus::Stopped;
    info!("Sentinel monitor loop exited");
}

/// Perform a single sentinel check tick.
/// Returns a summary event of what was checked.
async fn run_sentinel_tick(
    app_handle: &tauri::AppHandle,
    executor_handle: &TradeExecutorHandle,
    trigger_cooldowns: &mut std::collections::HashMap<String, i64>,
    tick_counter: &mut u32,
    sell_failures: &mut std::collections::HashMap<i64, u32>,
) -> Result<SentinelTickEvent, String> {
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

    // Load active sentinels
    let sentinels = sqlite::get_sentinels(db.pool(), active_profile.id)
        .await
        .map_err(|e| e.to_string())?;

    let active_sentinels: Vec<_> = sentinels
        .iter()
        .filter(|s| s.is_active && s.triggered_at.is_none())
        .collect();

    let active_count = active_sentinels.len() as u32;

    if active_sentinels.is_empty() {
        return Ok(SentinelTickEvent {
            status: MonitorStatus::Running,
            checked: 0,
            active_count: 0,
            last_check_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    // Drop DB lock before making API calls
    drop(db_guard);

    // Fetch portfolio for current prices (using cached client)
    let client = RugplayClient::new_with_cache(&token, state.coin_cache.clone());
    let portfolio = client.get_portfolio().await.map_err(|e| {
        format!("Failed to fetch portfolio: {}", e)
    })?;

    let held_symbols: std::collections::HashSet<String> = portfolio
        .coin_holdings
        .iter()
        .map(|h| h.symbol.clone())
        .collect();

    // Load blacklist from settings
    let blacklist_set: std::collections::HashSet<String> = {
        let db_guard = state.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            let settings_json: Option<String> = sqlx::query_scalar(
                "SELECT value FROM settings WHERE key = 'app_settings'"
            )
            .fetch_optional(db.pool())
            .await
            .unwrap_or(None);

            match settings_json {
                Some(ref j) => {
                    serde_json::from_str::<serde_json::Value>(j)
                        .ok()
                        .and_then(|s| s["blacklistedCoins"].as_array().map(|arr| {
                            arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
                        }))
                        .unwrap_or_default()
                }
                None => std::collections::HashSet::new(),
            }
        } else {
            std::collections::HashSet::new()
        }
    };

    // Increment tick counter once per tick
    *tick_counter = tick_counter.wrapping_add(1);

    // Periodically clean up stale sentinels (triggered or for coins no longer held)
    if *tick_counter % CLEANUP_EVERY_N_TICKS == 0 {
        let db_guard_cleanup = state.db.read().await;
        if let Some(db_cleanup) = db_guard_cleanup.as_ref() {
            let held_vec: Vec<String> = held_symbols.iter().cloned().collect();
            match sqlite::cleanup_stale_sentinels(db_cleanup.pool(), active_profile.id, &held_vec).await {
                Ok(removed) if removed > 0 => {
                    info!("Sentinel cleanup: removed {} stale sentinels for coins no longer held", removed);
                }
                Err(e) => {
                    warn!("Sentinel cleanup failed: {}", e);
                }
                _ => {}
            }
            // Clean up old triggered sentinels for coins no longer held
            match sqlite::cleanup_triggered_sentinels(db_cleanup.pool(), active_profile.id, &held_vec).await {
                Ok(removed) if removed > 0 => {
                    info!("Sentinel cleanup: purged {} triggered sentinels for sold coins", removed);
                }
                Err(e) => warn!("Triggered sentinel cleanup failed: {}", e),
                _ => {}
            }
            // Clean up duplicate triggered rows (keep only newest per symbol)
            match sqlite::cleanup_duplicate_triggered(db_cleanup.pool(), active_profile.id).await {
                Ok(removed) if removed > 0 => {
                    info!("Sentinel cleanup: removed {} duplicate triggered sentinels", removed);
                }
                Err(e) => warn!("Duplicate triggered cleanup failed: {}", e),
                _ => {}
            }
            // Also remove sentinels for blacklisted coins
            if !blacklist_set.is_empty() {
                let bl_vec: Vec<String> = blacklist_set.iter().cloned().collect();
                match sqlite::remove_blacklisted_sentinels(db_cleanup.pool(), active_profile.id, &bl_vec).await {
                    Ok(removed) if removed > 0 => {
                        info!("Sentinel cleanup: removed {} sentinels for blacklisted coins", removed);
                    }
                    Err(e) => warn!("Blacklist cleanup failed: {}", e),
                    _ => {}
                }
            }
        }
    }

    // Periodically sync sentinels with portfolio (auto-protection)
    if *tick_counter % SYNC_EVERY_N_TICKS == 0 {
        if let Err(e) = auto_sync_sentinels(app_handle, &portfolio, &active_profile, &held_symbols).await {
            debug!("Sentinel auto-sync skipped: {}", e);
        }

        // Re-fetch sentinels after sync may have added/removed rows
        let db_guard2 = state.db.read().await;
        if let Some(db2) = db_guard2.as_ref() {
            if let Ok(refreshed) = sqlite::get_sentinels(db2.pool(), active_profile.id).await {
                let refreshed_active: Vec<_> = refreshed
                    .iter()
                    .filter(|s| s.is_active && s.triggered_at.is_none())
                    .cloned()
                    .collect();
                let refreshed_count = refreshed_active.len() as u32;
                drop(db_guard2);

                // Run the check with refreshed sentinels
                return run_sentinel_checks(
                    app_handle, executor_handle, trigger_cooldowns, sell_failures,
                    &refreshed_active, refreshed_count, &portfolio, &held_symbols, &blacklist_set, &state,
                ).await;
            }
        }
    }

    let mut checked: u32 = 0;

    for sentinel in &active_sentinels {
        // Skip if coin is no longer held
        if !held_symbols.contains(&sentinel.symbol) {
            continue;
        }

        // Skip blacklisted coins
        if blacklist_set.contains(&sentinel.symbol) {
            debug!("Sentinel #{}: skipping {} (blacklisted)", sentinel.id, sentinel.symbol);
            continue;
        }

        // Skip if sentinel has too many consecutive sell failures
        if let Some(&failures) = sell_failures.get(&sentinel.id) {
            if failures >= MAX_SELL_FAILURES {
                debug!("Sentinel #{}: skipping, {} consecutive sell failures (deactivated)", sentinel.id, failures);
                continue;
            }
        }

        // Skip if in cooldown after a recent trigger
        let now_epoch = chrono::Utc::now().timestamp();
        if let Some(&cooldown_until) = trigger_cooldowns.get(&sentinel.symbol) {
            if now_epoch < cooldown_until {
                debug!("Sentinel: skipping {} (cooldown {}s remaining)", sentinel.symbol, cooldown_until - now_epoch);
                continue;
            }
        }

        // Grace period: skip newly created sentinels to prevent instant triggers
        if let Some(ref created_str) = sentinel.created_at {
            if let Ok(created) = chrono::NaiveDateTime::parse_from_str(created_str, "%Y-%m-%d %H:%M:%S") {
                let created_ts = created.and_utc().timestamp();
                let age = now_epoch - created_ts;
                if age < CREATION_GRACE_SECS {
                    debug!("Sentinel #{}: skipping {} (grace period, {}s old)", sentinel.id, sentinel.symbol, age);
                    continue;
                }
            }
        }

        let holding = match portfolio.coin_holdings.iter().find(|h| h.symbol == sentinel.symbol) {
            Some(h) => h,
            None => continue,
        };

        checked += 1;
        let current_price = holding.current_price;
        let entry_price = sentinel.entry_price;

        // Re-acquire DB lock for price updates
        let db_guard = state.db.read().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => continue,
        };

        // Update highest price seen (for trailing stop tracking)
        if current_price > sentinel.highest_price_seen {
            let _ = sqlite::update_highest_price(db.pool(), sentinel.id, current_price).await;
        }

        let trigger = evaluate_sentinel(sentinel, current_price);

        if let Some(trigger) = trigger {
            let reason = trigger.reason.clone();
            let trigger_type = trigger.trigger_type.as_str().to_string();
            info!("Sentinel #{} triggered for {}: {}", sentinel.id, sentinel.symbol, reason);

            // Send native notification
            if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                match trigger_type.as_str() {
                    "stop_loss" => {
                        let loss_pct = ((current_price - entry_price) / entry_price) * 100.0;
                        notif.notify_stop_loss(&sentinel.symbol, loss_pct, current_price).await;
                    }
                    "take_profit" => {
                        let gain_pct = ((current_price - entry_price) / entry_price) * 100.0;
                        notif.notify_take_profit(&sentinel.symbol, gain_pct, current_price).await;
                    }
                    "trailing_stop" => {
                        let drop_pct = sentinel.trailing_stop_pct.unwrap_or(0.0);
                        notif.notify_trailing_stop(&sentinel.symbol, drop_pct, current_price).await;
                    }
                    _ => {}
                }
            }

            let sell_qty = holding.quantity * (sentinel.sell_percentage / 100.0);
            // Cap to 99% of holdings to avoid "Cannot sell more than 99.5% of pool" errors
            let sell_qty = if sentinel.sell_percentage >= 100.0 {
                f64::min(sell_qty, holding.quantity * MAX_POOL_SELL_FRACTION)
            } else {
                sell_qty
            };
            let sell_qty = truncate_to_8_decimals(sell_qty);

            // Skip if holding balance is effectively zero
            if sell_qty <= 0.0 || holding.quantity <= 0.0 {
                warn!("Sentinel #{}: skipping {} — zero balance (qty={}, sell_qty={})", sentinel.id, sentinel.symbol, holding.quantity, sell_qty);
                let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                continue;
            }

            {
                // Emit sentinel-triggered event to frontend
                let triggered_event = SentinelTriggeredEvent {
                    sentinel_id: sentinel.id,
                    symbol: sentinel.symbol.clone(),
                    reason: reason.clone(),
                    trigger_type: trigger_type.clone(),
                    current_price,
                    entry_price,
                    sell_amount: sell_qty,
                    sell_percentage: sentinel.sell_percentage,
                };
                if let Err(e) = app_handle.emit("sentinel-triggered", &triggered_event) {
                    warn!("Failed to emit sentinel-triggered event: {}", e);
                }

                // Submit sell through the trade executor and WAIT for the result
                let sell_result = executor_handle
                    .submit_trade(
                        sentinel.symbol.clone(),
                        TradeType::Sell,
                        sell_qty,
                        TradePriority::High,
                        format!("Sentinel #{}: {}", sentinel.id, reason),
                    )
                    .await;

                match sell_result {
                    Ok(_response) => {
                        info!("Sentinel #{} sell CONFIRMED for {} — {}", sentinel.id, sentinel.symbol, reason);

                        // Clear failure counter on success
                        sell_failures.remove(&sentinel.id);

                        let pnl_pct = if entry_price > 0.0 { ((current_price - entry_price) / entry_price) * 100.0 } else { 0.0 };

                        save_automation_log(
                            &app_handle,
                            "sentinel",
                            &sentinel.symbol,
                            &sentinel.symbol,
                            "SELL",
                            sell_qty,
                            &serde_json::json!({
                                "sentinelId": sentinel.id,
                                "triggerType": trigger_type,
                                "reason": reason,
                                "entryPrice": entry_price,
                                "triggerPrice": trigger.trigger_price,
                                "currentPrice": current_price,
                                "pnlPct": (pnl_pct * 100.0).round() / 100.0,
                                "sellPercentage": sentinel.sell_percentage,
                                "status": "confirmed",
                            }).to_string(),
                        ).await;

                        if sentinel.sell_percentage >= 100.0 {
                            let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                        } else {
                            let _ = sqlite::rearm_sentinel(db.pool(), sentinel.id, current_price).await;
                            info!("Sentinel #{} re-armed after partial sell ({:.0}%) — new entry price: {}", sentinel.id, sentinel.sell_percentage, current_price);
                        }
                    }
                    Err(e) => {
                        let error_str = e.to_string();
                        let is_rate_limited = error_str.contains("429") || error_str.contains("Rate limit");
                        let is_pool_limit = error_str.contains("99.5%") || error_str.contains("pool tokens");
                        let is_zero_balance = error_str.contains("Insufficient coins") || error_str.contains("have 0");

                        // Don't count rate limits or pool limits as "real" failures
                        if is_rate_limited {
                            warn!("Sentinel #{}: rate-limited for {}, will retry next tick", sentinel.id, sentinel.symbol);
                            // Use short cooldown for rate limits
                            trigger_cooldowns.insert(sentinel.symbol.clone(), chrono::Utc::now().timestamp() + FAILED_COOLDOWN_SECS);
                        } else if is_zero_balance {
                            warn!("Sentinel #{}: {} has zero balance, marking triggered", sentinel.id, sentinel.symbol);
                            let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                        } else if is_pool_limit {
                            warn!("Sentinel #{}: pool limit hit for {}, will retry with smaller amount", sentinel.id, sentinel.symbol);
                            // Don't increment failure counter, the next tick will use the capped amount
                        } else {
                            let fail_count = sell_failures.entry(sentinel.id).or_insert(0);
                            *fail_count += 1;
                            error!(
                                "Sentinel #{} sell FAILED for {} (attempt {}/{}): {}",
                                sentinel.id, sentinel.symbol, fail_count, MAX_SELL_FAILURES, e
                            );

                            if *fail_count >= MAX_SELL_FAILURES {
                                warn!(
                                    "Sentinel #{} for {} deactivated after {} consecutive sell failures",
                                    sentinel.id, sentinel.symbol, MAX_SELL_FAILURES
                                );
                                let _ = sqlite::set_sentinel_active(db.pool(), sentinel.id, false).await;

                                if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                                    notif.send_raw(
                                        &format!("Sentinel Failed: {}", sentinel.symbol),
                                        &format!("Sell failed {} times, sentinel deactivated. Check your holdings.", MAX_SELL_FAILURES),
                                    ).await;
                                }
                            }
                        }

                        save_automation_log(
                            &app_handle,
                            "sentinel",
                            &sentinel.symbol,
                            &sentinel.symbol,
                            "SELL_FAILED",
                            sell_qty,
                            &serde_json::json!({
                                "sentinelId": sentinel.id,
                                "triggerType": trigger_type,
                                "reason": reason,
                                "entryPrice": entry_price,
                                "triggerPrice": trigger.trigger_price,
                                "currentPrice": current_price,
                                "error": e,
                                "failureCount": sell_failures.get(&sentinel.id).copied().unwrap_or(0),
                                "isRateLimited": is_rate_limited,
                            }).to_string(),
                        ).await;
                    }
                }

                // Set appropriate cooldown: shorter for failures, longer for successful sells
                if !trigger_cooldowns.contains_key(&sentinel.symbol) {
                    trigger_cooldowns.insert(sentinel.symbol.clone(), chrono::Utc::now().timestamp() + TRIGGER_COOLDOWN_SECS);
                }
            }
        }

        drop(db_guard);
    }

    Ok(SentinelTickEvent {
        status: MonitorStatus::Running,
        checked,
        active_count,
        last_check_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Refactored sentinel check logic used after a sync refresh
async fn run_sentinel_checks(
    app_handle: &tauri::AppHandle,
    executor_handle: &TradeExecutorHandle,
    trigger_cooldowns: &mut std::collections::HashMap<String, i64>,
    sell_failures: &mut std::collections::HashMap<i64, u32>,
    active_sentinels: &[sqlite::SentinelRow],
    active_count: u32,
    portfolio: &rugplay_core::PortfolioResponse,
    held_symbols: &std::collections::HashSet<String>,
    blacklist: &std::collections::HashSet<String>,
    state: &AppState,
) -> Result<SentinelTickEvent, String> {
    let mut checked: u32 = 0;

    for sentinel in active_sentinels {
        if !held_symbols.contains(&sentinel.symbol) {
            continue;
        }

        if blacklist.contains(&sentinel.symbol) {
            continue;
        }

        // Skip if sentinel has too many consecutive sell failures
        if let Some(&failures) = sell_failures.get(&sentinel.id) {
            if failures >= MAX_SELL_FAILURES {
                continue;
            }
        }

        let now_epoch = chrono::Utc::now().timestamp();
        if let Some(&cooldown_until) = trigger_cooldowns.get(&sentinel.symbol) {
            if now_epoch < cooldown_until {
                continue;
            }
        }

        // Grace period: skip newly created sentinels to prevent instant triggers
        if let Some(ref created_str) = sentinel.created_at {
            if let Ok(created) = chrono::NaiveDateTime::parse_from_str(created_str, "%Y-%m-%d %H:%M:%S") {
                let created_ts = created.and_utc().timestamp();
                let age = now_epoch - created_ts;
                if age < CREATION_GRACE_SECS {
                    debug!("Sentinel #{}: skipping {} (grace period, {}s old)", sentinel.id, sentinel.symbol, age);
                    continue;
                }
            }
        }

        let holding = match portfolio.coin_holdings.iter().find(|h| h.symbol == sentinel.symbol) {
            Some(h) => h,
            None => continue,
        };

        checked += 1;
        let current_price = holding.current_price;
        let entry_price = sentinel.entry_price;

        let db_guard = state.db.read().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => continue,
        };

        if current_price > sentinel.highest_price_seen {
            let _ = sqlite::update_highest_price(db.pool(), sentinel.id, current_price).await;
        }

        let trigger = evaluate_sentinel(sentinel, current_price);

        if let Some(trigger) = trigger {
            let reason = trigger.reason.clone();
            let trigger_type = trigger.trigger_type.as_str().to_string();
            info!("Sentinel #{} triggered for {}: {}", sentinel.id, sentinel.symbol, reason);

            if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                match trigger_type.as_str() {
                    "stop_loss" => {
                        let loss_pct = ((current_price - entry_price) / entry_price) * 100.0;
                        notif.notify_stop_loss(&sentinel.symbol, loss_pct, current_price).await;
                    }
                    "take_profit" => {
                        let gain_pct = ((current_price - entry_price) / entry_price) * 100.0;
                        notif.notify_take_profit(&sentinel.symbol, gain_pct, current_price).await;
                    }
                    "trailing_stop" => {
                        let drop_pct = sentinel.trailing_stop_pct.unwrap_or(0.0);
                        notif.notify_trailing_stop(&sentinel.symbol, drop_pct, current_price).await;
                    }
                    _ => {}
                }
            }

            let sell_qty = holding.quantity * (sentinel.sell_percentage / 100.0);
            let sell_qty = if sentinel.sell_percentage >= 100.0 {
                f64::min(sell_qty, holding.quantity * MAX_POOL_SELL_FRACTION)
            } else {
                sell_qty
            };
            let sell_qty = truncate_to_8_decimals(sell_qty);

            if sell_qty <= 0.0 || holding.quantity <= 0.0 {
                warn!("Sentinel #{}: skipping {} — zero balance", sentinel.id, sentinel.symbol);
                let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                continue;
            }

            {
                let triggered_event = SentinelTriggeredEvent {
                    sentinel_id: sentinel.id,
                    symbol: sentinel.symbol.clone(),
                    reason: reason.clone(),
                    trigger_type: trigger_type.clone(),
                    current_price,
                    entry_price,
                    sell_amount: sell_qty,
                    sell_percentage: sentinel.sell_percentage,
                };
                let _ = app_handle.emit("sentinel-triggered", &triggered_event);

                let sell_result = executor_handle
                    .submit_trade(
                        sentinel.symbol.clone(),
                        TradeType::Sell,
                        sell_qty,
                        TradePriority::High,
                        format!("Sentinel #{}: {}", sentinel.id, reason),
                    )
                    .await;

                match sell_result {
                    Ok(_response) => {
                        info!("Sentinel #{} sell CONFIRMED for {} — {}", sentinel.id, sentinel.symbol, reason);
                        sell_failures.remove(&sentinel.id);

                        let pnl_pct = if entry_price > 0.0 { ((current_price - entry_price) / entry_price) * 100.0 } else { 0.0 };

                        save_automation_log(
                            &app_handle,
                            "sentinel",
                            &sentinel.symbol,
                            &sentinel.symbol,
                            "SELL",
                            sell_qty,
                            &serde_json::json!({
                                "sentinelId": sentinel.id,
                                "triggerType": trigger_type,
                                "reason": reason,
                                "entryPrice": entry_price,
                                "triggerPrice": trigger.trigger_price,
                                "currentPrice": current_price,
                                "pnlPct": (pnl_pct * 100.0).round() / 100.0,
                                "sellPercentage": sentinel.sell_percentage,
                                "status": "confirmed",
                            }).to_string(),
                        ).await;

                        if sentinel.sell_percentage >= 100.0 {
                            let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                        } else {
                            let _ = sqlite::rearm_sentinel(db.pool(), sentinel.id, current_price).await;
                            info!("Sentinel #{} re-armed after partial sell ({:.0}%) — new entry price: {}", sentinel.id, sentinel.sell_percentage, current_price);
                        }
                    }
                    Err(e) => {
                        let error_str = e.to_string();
                        let is_rate_limited = error_str.contains("429") || error_str.contains("Rate limit");
                        let is_pool_limit = error_str.contains("99.5%") || error_str.contains("pool tokens");
                        let is_zero_balance = error_str.contains("Insufficient coins") || error_str.contains("have 0");

                        if is_rate_limited {
                            warn!("Sentinel #{}: rate-limited for {}, will retry next tick", sentinel.id, sentinel.symbol);
                            trigger_cooldowns.insert(sentinel.symbol.clone(), chrono::Utc::now().timestamp() + FAILED_COOLDOWN_SECS);
                        } else if is_zero_balance {
                            warn!("Sentinel #{}: {} has zero balance, marking triggered", sentinel.id, sentinel.symbol);
                            let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                        } else if is_pool_limit {
                            warn!("Sentinel #{}: pool limit hit for {}, will retry with smaller amount", sentinel.id, sentinel.symbol);
                        } else {
                            let fail_count = sell_failures.entry(sentinel.id).or_insert(0);
                            *fail_count += 1;
                            error!(
                                "Sentinel #{} sell FAILED for {} (attempt {}/{}): {}",
                                sentinel.id, sentinel.symbol, fail_count, MAX_SELL_FAILURES, e
                            );

                            if *fail_count >= MAX_SELL_FAILURES {
                                warn!("Sentinel #{} for {} deactivated after {} consecutive failures", sentinel.id, sentinel.symbol, MAX_SELL_FAILURES);
                                let _ = sqlite::set_sentinel_active(db.pool(), sentinel.id, false).await;
                            }
                        }

                        save_automation_log(
                            &app_handle,
                            "sentinel",
                            &sentinel.symbol,
                            &sentinel.symbol,
                            "SELL_FAILED",
                            sell_qty,
                            &serde_json::json!({
                                "sentinelId": sentinel.id,
                                "triggerType": trigger_type,
                                "reason": reason,
                                "entryPrice": entry_price,
                                "triggerPrice": trigger.trigger_price,
                                "currentPrice": current_price,
                                "error": e,
                                "failureCount": sell_failures.get(&sentinel.id).copied().unwrap_or(0),
                                "isRateLimited": is_rate_limited,
                            }).to_string(),
                        ).await;
                    }
                }

                if !trigger_cooldowns.contains_key(&sentinel.symbol) {
                    trigger_cooldowns.insert(sentinel.symbol.clone(), chrono::Utc::now().timestamp() + TRIGGER_COOLDOWN_SECS);
                }
            }
        }

        drop(db_guard);
    }

    Ok(SentinelTickEvent {
        status: MonitorStatus::Running,
        checked,
        active_count,
        last_check_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Automatically sync sentinels with the current portfolio.
/// Removes sentinels for coins no longer held, adds default sentinels for new holdings.
async fn auto_sync_sentinels(
    app_handle: &tauri::AppHandle,
    portfolio: &rugplay_core::PortfolioResponse,
    active_profile: &rugplay_core::Profile,
    held_symbols: &std::collections::HashSet<String>,
) -> Result<(), String> {
    let state = app_handle.state::<AppState>();

    // Load settings for defaults
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let settings_json: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'app_settings'"
    )
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let (default_sl, default_tp, default_ts, default_sell, blacklist) = match settings_json {
        Some(ref j) => {
            if let Ok(settings) = serde_json::from_str::<serde_json::Value>(j) {
                let sd = &settings["sentinelDefaults"];
                let sl = sd["stopLossPct"].as_f64();
                let tp = sd["takeProfitPct"].as_f64();
                let ts = sd["trailingStopPct"].as_f64();
                let sell = sd["sellPercentage"].as_f64().unwrap_or(100.0);
                let bl: Vec<String> = settings["blacklistedCoins"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                (sl, tp, ts, sell, bl)
            } else {
                (Some(-10.0), Some(50.0), None, 100.0, Vec::new())
            }
        }
        None => (Some(-10.0), Some(50.0), None, 100.0, Vec::new()),
    };

    let blacklist_set: std::collections::HashSet<&str> = blacklist.iter().map(|s| s.as_str()).collect();

    let sentinels = sqlite::get_sentinels(db.pool(), active_profile.id)
        .await
        .map_err(|e| e.to_string())?;

    let sentinel_symbols: std::collections::HashSet<String> = sentinels.iter().map(|s| s.symbol.clone()).collect();

    let mut added = 0u32;

    // Remove ALL sentinels (including triggered) for coins no longer held
    let held_vec: Vec<String> = held_symbols.iter().cloned().collect();
    let removed = match sqlite::cleanup_stale_sentinels(db.pool(), active_profile.id, &held_vec).await {
        Ok(count) => {
            if count > 0 {
                debug!("Auto-sync: cleaned up {} stale sentinels", count);
            }
            count as u32
        }
        Err(e) => {
            warn!("Auto-sync: failed to cleanup stale sentinels: {}", e);
            0u32
        }
    };

    // Also clean up triggered sentinels for coins no longer held
    match sqlite::cleanup_triggered_sentinels(db.pool(), active_profile.id, &held_vec).await {
        Ok(count) if count > 0 => {
            info!("Auto-sync: purged {} old triggered sentinels", count);
        }
        Err(e) => warn!("Auto-sync: triggered cleanup failed: {}", e),
        _ => {}
    }

    // Remove sentinels for blacklisted coins
    if !blacklist.is_empty() {
        match sqlite::remove_blacklisted_sentinels(db.pool(), active_profile.id, &blacklist).await {
            Ok(count) if count > 0 => {
                info!("Auto-sync: removed {} sentinels for blacklisted coins", count);
            }
            Err(e) => {
                warn!("Auto-sync: failed to remove blacklisted sentinels: {}", e);
            }
            _ => {}
        }
    }

    // Sync sentinels with portfolio: create new ones and update entry prices
    // on existing ones to match the server's weighted avg_purchase_price.
    for holding in &portfolio.coin_holdings {
        if blacklist_set.contains(holding.symbol.as_str()) {
            continue;
        }

        let avg_entry = if holding.avg_purchase_price > 0.0 {
            holding.avg_purchase_price
        } else {
            holding.current_price
        };

        // Guard: if the weighted avg entry would cause an IMMEDIATE SL trigger
        // at the current price, use the current market price instead.
        // This prevents the scenario where a user re-buys a coin at a low price
        // but the old expensive position drags the avg entry way above current,
        // causing an instant sell.
        let entry_price = if let Some(sl) = default_sl {
            if sl < 0.0 {
                let sl_floor = avg_entry * (1.0 + sl / 100.0);
                if holding.current_price <= sl_floor && holding.current_price > 0.0 {
                    info!(
                        "Auto-sync: using current price {:.8} instead of avg {:.8} for {} (would instantly trigger SL={:.0}%)",
                        holding.current_price, avg_entry, holding.symbol, sl
                    );
                    holding.current_price
                } else {
                    avg_entry
                }
            } else {
                avg_entry
            }
        } else {
            avg_entry
        };

        if sentinel_symbols.contains(&holding.symbol) {
            // Existing sentinel: sync entry price with portfolio avg if it drifted
            if let Some(existing) = sentinels.iter().find(|s| s.symbol == holding.symbol && s.triggered_at.is_none()) {
                let price_diff = (existing.entry_price - entry_price).abs();
                if entry_price > 0.0 && price_diff / entry_price > 0.001 {
                    // Same guard for existing sentinels: don't sync to a price
                    // that would cause an immediate trigger
                    let safe_entry = if let Some(sl) = existing.stop_loss_pct {
                        if sl < 0.0 {
                            let sl_floor = entry_price * (1.0 + sl / 100.0);
                            if holding.current_price <= sl_floor && holding.current_price > 0.0 {
                                info!(
                                    "Auto-sync: skipping entry sync for {} — would trigger SL (avg={:.8}, current={:.8})",
                                    holding.symbol, entry_price, holding.current_price
                                );
                                continue;
                            }
                        }
                        entry_price
                    } else {
                        entry_price
                    };
                    if let Err(e) = sqlite::sync_entry_price(db.pool(), existing.id, safe_entry).await {
                        warn!("Auto-sync: failed to update entry price for {}: {}", holding.symbol, e);
                    } else {
                        debug!("Auto-sync: updated {} entry price {:.8} -> {:.8}", holding.symbol, existing.entry_price, safe_entry);
                    }
                }
            }
        } else {
            // New holding without a sentinel: create one with defaults
            match sqlite::upsert_sentinel(
                db.pool(),
                active_profile.id,
                &holding.symbol,
                default_sl,
                default_tp,
                default_ts,
                default_sell,
                entry_price,
            ).await {
                Ok(_) => {
                    added += 1;
                    debug!("Auto-sync: created sentinel for {}", holding.symbol);
                }
                Err(e) => {
                    warn!("Auto-sync: failed to create sentinel for {}: {}", holding.symbol, e);
                }
            }
        }
    }

    if removed > 0 || added > 0 {
        info!("Sentinel auto-sync: {} removed, {} added", removed, added);
    }

    Ok(())
}
