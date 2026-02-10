//! Centralized Trade Executor with priority queue and risk limits
//!
//! All trades flow through this executor to enforce rate limiting,
//! priority ordering, risk validation, retry logic, and event emission.

use rugplay_core::{TradeRequest, TradeResponse, TradeType, truncate_to_8_decimals};
use rugplay_networking::RugplayClient;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, error, info, warn};

/// Maximum number of orders that can be queued in the priority heap
const MAX_QUEUE_DEPTH: usize = 1000;

/// Try to get the NotificationHandle without panicking if not yet registered
fn try_notify(app_handle: &tauri::AppHandle) -> Option<crate::notifications::NotificationHandle> {
    use tauri::Manager;
    app_handle
        .try_state::<crate::notifications::NotificationHandle>()
        .map(|s: tauri::State<'_, crate::notifications::NotificationHandle>| s.inner().clone())
}

/// Priority levels for trade orders
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradePriority {
    /// Normal manual trades
    Normal = 0,
    /// High priority — stop-loss / take-profit auto-sells
    High = 1,
    /// Critical — moonbag instant-sell, emergency exits
    Critical = 2,
}

impl PartialOrd for TradePriority {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TradePriority {
    fn cmp(&self, other: &Self) -> Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}

/// A trade order submitted to the executor
#[derive(Debug)]
pub struct TradeOrder {
    pub symbol: String,
    pub trade_type: TradeType,
    pub amount: f64,
    pub priority: TradePriority,
    pub reason: String,
    /// Channel to send the result back to the caller
    pub result_tx: oneshot::Sender<Result<TradeResponse, String>>,
}

/// Wrapper for BinaryHeap ordering (higher priority first)
struct PrioritizedOrder {
    order: TradeOrder,
    /// Monotonic sequence number for FIFO within same priority
    seq: u64,
}

impl PartialEq for PrioritizedOrder {
    fn eq(&self, other: &Self) -> bool {
        self.order.priority == other.order.priority && self.seq == other.seq
    }
}

impl Eq for PrioritizedOrder {}

impl PartialOrd for PrioritizedOrder {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PrioritizedOrder {
    fn cmp(&self, other: &Self) -> Ordering {
        // Higher priority first, then lower sequence (FIFO)
        self.order
            .priority
            .cmp(&other.order.priority)
            .then_with(|| other.seq.cmp(&self.seq))
    }
}

/// Event emitted when a trade is executed
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeExecutedEvent {
    pub symbol: String,
    pub trade_type: String,
    pub amount: f64,
    pub new_price: f64,
    pub price_impact: f64,
    pub new_balance: f64,
    pub reason: String,
    pub success: bool,
    pub error: Option<String>,
}

// ─── Risk Limits ─────────────────────────────────────────────────────

/// Configurable risk limits enforced before trade execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskLimits {
    /// Max USD value for a single buy order (0 = unlimited)
    pub max_position_usd: f64,
    /// Max number of trades per 24h rolling window (0 = unlimited)
    pub max_daily_trades_count: u32,
    /// Max total USD volume per 24h rolling window (0 = unlimited)
    pub max_daily_volume_usd: f64,
    /// Cooldown in seconds after a losing trade before next buy (0 = disabled)
    pub cooldown_after_loss_secs: u64,
    /// Number of retry attempts on trade failure (0 = no retry)
    #[serde(default = "default_retry_count")]
    pub retry_count: u32,
    /// Base delay in milliseconds between retries (exponential backoff)
    #[serde(default = "default_retry_delay_ms")]
    pub retry_delay_ms: u64,
    /// Milliseconds between consecutive trades (rate limiting)
    #[serde(default = "default_rate_limit_ms")]
    pub rate_limit_ms: u64,
}

fn default_retry_count() -> u32 { 2 }
fn default_retry_delay_ms() -> u64 { 1000 }
fn default_rate_limit_ms() -> u64 { 500 }

impl Default for RiskLimits {
    fn default() -> Self {
        Self {
            max_position_usd: 0.0,        // unlimited
            max_daily_trades_count: 0,     // unlimited
            max_daily_volume_usd: 0.0,     // unlimited
            cooldown_after_loss_secs: 0,   // disabled
            retry_count: 2,                // 2 retries by default
            retry_delay_ms: 1000,          // 1s base delay
            rate_limit_ms: 500,            // 500ms between trades
        }
    }
}

/// Tracks daily trading activity for risk enforcement
/// Persisted to SQLite and restored on startup so counters survive restarts.
#[derive(Debug, Default, Serialize, Deserialize)]
struct DailyTracker {
    /// (timestamp, usd_amount) for each trade in the last 24h
    trades: Vec<(i64, f64)>,
    /// Timestamp of the last losing trade (sell at loss)
    last_loss_timestamp: Option<i64>,
    /// Flag to indicate the tracker has unsaved changes
    #[serde(skip)]
    dirty: bool,
}

impl DailyTracker {
    /// Prune trades older than 24h and return current stats
    fn stats(&mut self) -> (u32, f64) {
        let cutoff = chrono::Utc::now().timestamp() - 86400;
        let before = self.trades.len();
        self.trades.retain(|(ts, _)| *ts > cutoff);
        if self.trades.len() != before {
            self.dirty = true;
        }
        let count = self.trades.len() as u32;
        let volume: f64 = self.trades.iter().map(|(_, amt)| amt).sum();
        (count, volume)
    }

    /// Record a trade
    fn record(&mut self, usd_amount: f64) {
        self.trades.push((chrono::Utc::now().timestamp(), usd_amount));
        self.dirty = true;
    }

    /// Record a loss
    fn record_loss(&mut self) {
        self.last_loss_timestamp = Some(chrono::Utc::now().timestamp());
        self.dirty = true;
    }

    /// Check if in cooldown
    fn in_cooldown(&self, cooldown_secs: u64) -> bool {
        if cooldown_secs == 0 {
            return false;
        }
        if let Some(ts) = self.last_loss_timestamp {
            let elapsed = chrono::Utc::now().timestamp() - ts;
            return elapsed < cooldown_secs as i64;
        }
        false
    }
}

/// Handle to submit trades to the executor
#[derive(Clone)]
pub struct TradeExecutorHandle {
    tx: mpsc::Sender<TradeOrder>,
    risk_limits: Arc<RwLock<RiskLimits>>,
}

impl TradeExecutorHandle {
    /// Submit a trade order and wait for the result
    pub async fn submit_trade(
        &self,
        symbol: String,
        trade_type: TradeType,
        amount: f64,
        priority: TradePriority,
        reason: String,
    ) -> Result<TradeResponse, String> {
        let (result_tx, result_rx) = oneshot::channel();

        let order = TradeOrder {
            symbol,
            trade_type,
            amount,
            priority,
            reason,
            result_tx,
        };

        self.tx
            .send(order)
            .await
            .map_err(|_| "Trade executor channel closed".to_string())?;

        result_rx
            .await
            .map_err(|_| "Trade executor dropped result channel".to_string())?
    }

    /// Submit a trade order without waiting for the result (fire-and-forget)
    pub async fn submit_trade_fire_and_forget(
        &self,
        symbol: String,
        trade_type: TradeType,
        amount: f64,
        priority: TradePriority,
        reason: String,
    ) {
        let (result_tx, _result_rx) = oneshot::channel();

        let order = TradeOrder {
            symbol,
            trade_type,
            amount,
            priority,
            reason,
            result_tx,
        };

        if let Err(e) = self.tx.send(order).await {
            error!("Failed to submit trade: {}", e);
        }
    }

    /// Update the risk limits configuration
    pub async fn set_risk_limits(&self, limits: RiskLimits) {
        *self.risk_limits.write().await = limits;
        info!("Risk limits updated: {:?}", self.risk_limits.read().await);
    }

    /// Get the current risk limits
    pub async fn get_risk_limits(&self) -> RiskLimits {
        self.risk_limits.read().await.clone()
    }
}

/// Spawn the trade executor background task.
///
/// Returns a handle that can be used to submit trades.
/// The task processes orders from a priority queue with rate limiting (500ms between trades).
pub fn spawn_trade_executor(
    app_handle: tauri::AppHandle,
) -> TradeExecutorHandle {
    let (tx, rx) = mpsc::channel::<TradeOrder>(256);
    let risk_limits = Arc::new(RwLock::new(RiskLimits::default()));

    tokio::spawn(trade_executor_loop(rx, app_handle, risk_limits.clone()));

    TradeExecutorHandle { tx, risk_limits }
}

/// The main executor loop — drains incoming orders into a priority heap,
/// processes them one at a time with rate limiting, risk validation, and retry logic.
async fn trade_executor_loop(
    mut rx: mpsc::Receiver<TradeOrder>,
    app_handle: tauri::AppHandle,
    risk_limits: Arc<RwLock<RiskLimits>>,
) {
    info!("Trade executor started");

    let mut heap: BinaryHeap<PrioritizedOrder> = BinaryHeap::new();
    let mut seq: u64 = 0;

    // Load persisted daily tracker or start fresh
    let mut tracker = load_daily_tracker(&app_handle).await;
    let mut save_counter: u32 = 0; // persist every 5 trades

    loop {
        // If heap is empty, block until we get an order
        if heap.is_empty() {
            match rx.recv().await {
                Some(order) => {
                    seq += 1;
                    heap.push(PrioritizedOrder { order, seq });
                }
                None => {
                    info!("Trade executor channel closed, shutting down");
                    // Persist tracker on shutdown
                    save_daily_tracker(&app_handle, &tracker).await;
                    return;
                }
            }
        }

        // Drain any additional pending orders into the heap (non-blocking)
        while let Ok(order) = rx.try_recv() {
            if heap.len() >= MAX_QUEUE_DEPTH {
                warn!("Trade executor queue full ({} orders), rejecting order for {}", MAX_QUEUE_DEPTH, order.symbol);
                let _ = order.result_tx.send(Err(format!(
                    "Trade queue full ({} orders) — try again later", MAX_QUEUE_DEPTH
                )));
                continue;
            }
            seq += 1;
            heap.push(PrioritizedOrder { order, seq });
        }

        // Process the highest priority order
        if let Some(prioritized) = heap.pop() {
            let order = prioritized.order;
            debug!(
                "Executing {:?} trade: {:?} {} of {} (reason: {})",
                order.priority, order.trade_type, order.amount, order.symbol, order.reason
            );

            // ── Risk validation (only for buys, skip for Critical priority) ──
            if matches!(order.trade_type, TradeType::Buy) && order.priority != TradePriority::Critical {
                let limits = risk_limits.read().await;

                // Check max position size
                if limits.max_position_usd > 0.0 && order.amount > limits.max_position_usd {
                    let msg = format!(
                        "Risk limit: buy ${:.2} exceeds max position ${:.2}",
                        order.amount, limits.max_position_usd
                    );
                    warn!("{}", msg);
                    emit_rejected(&app_handle, &order, &msg);
                    let _ = order.result_tx.send(Err(msg));
                    continue;
                }

                // Check daily trade count
                let (daily_count, daily_volume) = tracker.stats();
                if limits.max_daily_trades_count > 0 && daily_count >= limits.max_daily_trades_count {
                    let msg = format!(
                        "Risk limit: {} trades today, max {}",
                        daily_count, limits.max_daily_trades_count
                    );
                    warn!("{}", msg);
                    emit_rejected(&app_handle, &order, &msg);
                    let _ = order.result_tx.send(Err(msg));
                    continue;
                }

                // Check daily volume
                if limits.max_daily_volume_usd > 0.0 && daily_volume + order.amount > limits.max_daily_volume_usd {
                    let msg = format!(
                        "Risk limit: daily volume ${:.2} + ${:.2} exceeds max ${:.2}",
                        daily_volume, order.amount, limits.max_daily_volume_usd
                    );
                    warn!("{}", msg);
                    emit_rejected(&app_handle, &order, &msg);
                    let _ = order.result_tx.send(Err(msg));
                    continue;
                }

                // Check loss cooldown
                if tracker.in_cooldown(limits.cooldown_after_loss_secs) {
                    let msg = format!(
                        "Risk limit: in {}-second cooldown after losing trade",
                        limits.cooldown_after_loss_secs
                    );
                    warn!("{}", msg);
                    emit_rejected(&app_handle, &order, &msg);
                    let _ = order.result_tx.send(Err(msg));
                    continue;
                }

                drop(limits);
            }

            // Read retry config
            let limits = risk_limits.read().await;
            let max_retries = limits.retry_count;
            let retry_base_ms = limits.retry_delay_ms;
            let rate_limit_ms = limits.rate_limit_ms;
            drop(limits);

            // Execute with retry logic
            let mut last_error = String::new();
            let mut result: Result<TradeResponse, String> = Err("Not attempted".to_string());

            for attempt in 0..=max_retries {
                if attempt > 0 {
                    // Exponential backoff: base_ms * 2^(attempt-1)
                    let delay_ms = retry_base_ms * (1u64 << (attempt - 1));
                    info!("Trade retry {}/{} for {} after {}ms", attempt, max_retries, order.symbol, delay_ms);
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }

                result = execute_single_trade(&app_handle, &order).await;
                match &result {
                    Ok(_) => break,
                    Err(e) => {
                        last_error = e.clone();
                        if attempt < max_retries {
                            warn!("Trade attempt {}/{} failed for {}: {} — retrying", attempt + 1, max_retries + 1, order.symbol, e);
                        } else {
                            error!("Trade failed after {} attempts for {}: {}", attempt + 1, order.symbol, e);
                        }
                    }
                }
            }

            // Track the trade for risk limits
            if let Ok(ref response) = result {
                let usd_amount = match order.trade_type {
                    TradeType::Buy => order.amount,
                    TradeType::Sell => order.amount * response.new_price,
                };
                tracker.record(usd_amount);

                // Improved loss detection for sells:
                // A sell is a "loss" if new_price < the implied entry (the price at buy)
                // We use price_impact < 0 as a reasonable heuristic since we don't
                // have entry cost here. The sentinel system has real entry prices.
                if matches!(order.trade_type, TradeType::Sell) && response.price_impact < 0.0 {
                    tracker.record_loss();
                }
            }

            // Emit event to frontend
            let event = match &result {
                Ok(response) => TradeExecutedEvent {
                    symbol: order.symbol.clone(),
                    trade_type: format!("{:?}", order.trade_type),
                    amount: order.amount,
                    new_price: response.new_price,
                    price_impact: response.price_impact,
                    new_balance: response.new_balance,
                    reason: order.reason.clone(),
                    success: true,
                    error: None,
                },
                Err(_) => TradeExecutedEvent {
                    symbol: order.symbol.clone(),
                    trade_type: format!("{:?}", order.trade_type),
                    amount: order.amount,
                    new_price: 0.0,
                    price_impact: 0.0,
                    new_balance: 0.0,
                    reason: order.reason.clone(),
                    success: false,
                    error: Some(last_error),
                },
            };

            // Emit to frontend via Tauri events
            if let Err(e) = app_handle.emit("trade-executed", &event) {
                warn!("Failed to emit trade-executed event: {}", e);
            }

            // Send result back to caller
            let _ = order.result_tx.send(result);

            // Persist daily tracker periodically (every 5 trades)
            save_counter += 1;
            if tracker.dirty && save_counter % 5 == 0 {
                save_daily_tracker(&app_handle, &tracker).await;
                tracker.dirty = false;
            }

            // Rate limit: configurable ms between trades
            tokio::time::sleep(std::time::Duration::from_millis(rate_limit_ms)).await;
        }
    }
}

/// Emit a risk-rejected event to the frontend and send notification
fn emit_rejected(app_handle: &tauri::AppHandle, order: &TradeOrder, reason: &str) {
    let event = TradeExecutedEvent {
        symbol: order.symbol.clone(),
        trade_type: format!("{:?}", order.trade_type),
        amount: order.amount,
        new_price: 0.0,
        price_impact: 0.0,
        new_balance: 0.0,
        reason: format!("REJECTED: {}", reason),
        success: false,
        error: Some(reason.to_string()),
    };
    let _ = app_handle.emit("trade-executed", &event);

    // Send native notification for risk rejection
    if let Some(notif) = try_notify(app_handle) {
        let symbol = order.symbol.clone();
        let reason_owned = reason.to_string();
        tokio::spawn(async move {
            notif.notify_risk_rejected(&symbol, &reason_owned).await;
        });
    }
}

/// Execute a single trade using the active profile's token
async fn execute_single_trade(
    app_handle: &tauri::AppHandle,
    order: &TradeOrder,
) -> Result<TradeResponse, String> {
    use crate::AppState;
    use rugplay_persistence::sqlite;
    use tauri::Manager;

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

    // Drop the DB lock before making the API call
    drop(db_guard);

    let client = RugplayClient::new_with_cache(&token, state.coin_cache.clone());

    // For sells, truncate to 8 decimal places
    let adjusted_amount = match order.trade_type {
        TradeType::Buy => order.amount,
        TradeType::Sell => truncate_to_8_decimals(order.amount),
    };

    let request = TradeRequest {
        trade_type: order.trade_type,
        amount: adjusted_amount,
    };

    let result = client
        .trade(&order.symbol, request)
        .await;

    // Handle pool token cap: if a sell exceeds 99.5% of pool tokens,
    // the server returns the max sellable amount — retry with that cap
    let response = match result {
        Err(ref e) if matches!(order.trade_type, TradeType::Sell) => {
            let err_str = e.to_string();
            if let Some(capped) = parse_max_sellable(&err_str) {
                let capped = truncate_to_8_decimals(capped);
                if capped > 0.0 && capped < adjusted_amount {
                    warn!(
                        "Sell {} of {} exceeds pool cap, retrying with max sellable: {}",
                        adjusted_amount, order.symbol, capped
                    );
                    let capped_request = TradeRequest {
                        trade_type: TradeType::Sell,
                        amount: capped,
                    };
                    client.trade(&order.symbol, capped_request)
                        .await
                        .map_err(|e| format!("Trade API error: {}", e))?
                } else {
                    return Err(format!("Trade API error: {}", e));
                }
            } else {
                return Err(format!("Trade API error: {}", e));
            }
        }
        Err(e) => return Err(format!("Trade API error: {}", e)),
        Ok(resp) => resp,
    };

    if !response.success {
        return Err("Trade was not successful".to_string());
    }

    info!(
        "Trade executed: {:?} {} of {} @ ${}, impact {:.4}%",
        order.trade_type, adjusted_amount, order.symbol, response.new_price, response.price_impact * 100.0
    );

    Ok(response)
}

// ─── Daily Tracker Persistence ───────────────────────────────────────

/// Load the daily tracker from SQLite settings table
async fn load_daily_tracker(app_handle: &tauri::AppHandle) -> DailyTracker {
    use crate::AppState;
    use tauri::Manager;

    // Give DB a moment on startup
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else {
        return DailyTracker::default();
    };

    let json: Option<String> = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'daily_tracker'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten();

    match json {
        Some(j) => {
            let mut tracker: DailyTracker = serde_json::from_str(&j).unwrap_or_default();
            // Prune old entries on load
            tracker.stats();
            tracker.dirty = false;
            info!("Daily tracker restored: {} trades in 24h window", tracker.trades.len());
            tracker
        }
        None => DailyTracker::default(),
    }
}

/// Save the daily tracker to SQLite settings table
async fn save_daily_tracker(app_handle: &tauri::AppHandle, tracker: &DailyTracker) {
    use crate::AppState;
    use tauri::Manager;

    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let json = match serde_json::to_string(tracker) {
        Ok(j) => j,
        Err(_) => return,
    };

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('daily_tracker', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(&json)
    .execute(db.pool())
    .await;

    debug!("Daily tracker persisted ({} trades)", tracker.trades.len());
}

/// Parse the max sellable token amount from a pool cap error message.
/// Example: `"Cannot sell more than 99.5% of pool tokens. Max sellable: 146960488 tokens"`
fn parse_max_sellable(error: &str) -> Option<f64> {
    if !error.contains("Max sellable:") {
        return None;
    }
    error
        .split("Max sellable:")
        .nth(1)?
        .trim()
        .split_whitespace()
        .next()?
        .parse::<f64>()
        .ok()
}
