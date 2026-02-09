//! Background Sentinel Monitor Loop
//!
//! A persistent Tokio task that automatically monitors sentinel conditions
//! (SL/TP/trailing stops) by polling portfolio prices on a configurable interval.
//! Submits triggered sells through the TradeExecutor queue.

use crate::notifications::NotificationHandle;
use crate::trade_executor::{TradeExecutorHandle, TradePriority};
use crate::AppState;
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

/// Cooldown in seconds after a sentinel triggers before it can re-check (per symbol)
const TRIGGER_COOLDOWN_SECS: i64 = 60;

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
                match run_sentinel_tick(&app_handle, &executor_handle, &mut trigger_cooldowns).await {
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

    let mut checked: u32 = 0;

    for sentinel in &active_sentinels {
        // Skip if coin is no longer held
        if !held_symbols.contains(&sentinel.symbol) {
            continue;
        }

        // Skip if in cooldown after a recent trigger
        let now_epoch = chrono::Utc::now().timestamp();
        if let Some(&cooldown_until) = trigger_cooldowns.get(&sentinel.symbol) {
            if now_epoch < cooldown_until {
                debug!("Sentinel: skipping {} (cooldown {}s remaining)", sentinel.symbol, cooldown_until - now_epoch);
                continue;
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

        let mut should_sell = false;
        let mut reason = String::new();
        let mut trigger_type = String::new();

        // Check stop loss
        if let Some(sl_pct) = sentinel.stop_loss_pct {
            let sl_price = entry_price * (1.0 - sl_pct.abs() / 100.0);
            if current_price <= sl_price {
                should_sell = true;
                trigger_type = "stop_loss".to_string();
                reason = format!(
                    "Stop loss triggered at {} (SL={:.1}%, target={})",
                    current_price, sl_pct, sl_price
                );
            }
        }

        // Check take profit
        if !should_sell {
            if let Some(tp_pct) = sentinel.take_profit_pct {
                let tp_price = entry_price * (1.0 + tp_pct / 100.0);
                if current_price >= tp_price {
                    should_sell = true;
                    trigger_type = "take_profit".to_string();
                    reason = format!(
                        "Take profit triggered at {} (TP={:.1}%, target={})",
                        current_price, tp_pct, tp_price
                    );
                }
            }
        }

        // Check trailing stop (skip if 0% — would always trigger)
        if !should_sell {
            if let Some(ts_pct) = sentinel.trailing_stop_pct {
                if ts_pct > 0.0 {
                    let highest = f64::max(sentinel.highest_price_seen, current_price);
                    let ts_price = highest * (1.0 - ts_pct / 100.0);
                    if current_price <= ts_price && current_price > entry_price {
                        should_sell = true;
                        trigger_type = "trailing_stop".to_string();
                        reason = format!(
                            "Trailing stop triggered at {} (TS={:.1}%, highest={}, target={})",
                            current_price, ts_pct, highest, ts_price
                        );
                    }
                }
            }
        }

        if should_sell {
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
            let sell_qty = truncate_to_8_decimals(sell_qty);

            if sell_qty > 0.0 {
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

                // Submit sell through the trade executor (High priority)
                executor_handle
                    .submit_trade_fire_and_forget(
                        sentinel.symbol.clone(),
                        TradeType::Sell,
                        sell_qty,
                        TradePriority::High,
                        format!("Sentinel #{}: {}", sentinel.id, reason),
                    )
                    .await;

                // Mark sentinel as triggered
                let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;

                // Set cooldown for this symbol
                trigger_cooldowns.insert(sentinel.symbol.clone(), chrono::Utc::now().timestamp() + TRIGGER_COOLDOWN_SECS);
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
