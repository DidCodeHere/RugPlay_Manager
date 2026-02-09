//! Sentinel commands for managing stop-loss/take-profit

use crate::AppState;
use rugplay_core::{TradeRequest, TradeType, truncate_to_8_decimals};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, error, info, warn};

/// Sentinel config for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelConfig {
    pub id: i64,
    pub symbol: String,
    pub stop_loss_pct: Option<f64>,
    pub take_profit_pct: Option<f64>,
    pub trailing_stop_pct: Option<f64>,
    pub sell_percentage: f64,
    pub entry_price: f64,
    pub highest_price_seen: f64,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub triggered_at: Option<String>,
}

impl From<sqlite::SentinelRow> for SentinelConfig {
    fn from(row: sqlite::SentinelRow) -> Self {
        Self {
            id: row.id,
            symbol: row.symbol,
            stop_loss_pct: row.stop_loss_pct,
            take_profit_pct: row.take_profit_pct,
            trailing_stop_pct: row.trailing_stop_pct,
            sell_percentage: row.sell_percentage,
            entry_price: row.entry_price,
            highest_price_seen: row.highest_price_seen,
            is_active: row.is_active,
            created_at: row.created_at,
            triggered_at: row.triggered_at,
        }
    }
}

/// Request to create a new sentinel
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSentinelRequest {
    pub symbol: String,
    pub stop_loss_pct: Option<f64>,
    pub take_profit_pct: Option<f64>,
    pub trailing_stop_pct: Option<f64>,
    pub sell_percentage: f64,
    pub entry_price: f64,
}

/// Create a new sentinel for the active profile
#[tauri::command]
pub async fn create_sentinel(
    request: CreateSentinelRequest,
    state: State<'_, AppState>,
) -> Result<SentinelConfig, String> {
    debug!("Creating sentinel for {}", request.symbol);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let sentinel_id = sqlite::create_sentinel(
        db.pool(),
        active_profile.id,
        &request.symbol,
        request.stop_loss_pct,
        request.take_profit_pct,
        request.trailing_stop_pct,
        request.sell_percentage,
        request.entry_price,
    )
    .await
    .map_err(|e| {
        error!("Failed to create sentinel: {}", e);
        e.to_string()
    })?;

    info!(
        "Created sentinel {} for {} with SL={:?} TP={:?} TS={:?}",
        sentinel_id,
        request.symbol,
        request.stop_loss_pct,
        request.take_profit_pct,
        request.trailing_stop_pct
    );

    // Fetch and return the created sentinel
    let sentinel = sqlite::get_sentinel_by_id(db.pool(), sentinel_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Failed to retrieve created sentinel")?;

    Ok(SentinelConfig::from(sentinel))
}

/// List all sentinels for the active profile
#[tauri::command]
pub async fn list_sentinels(state: State<'_, AppState>) -> Result<Vec<SentinelConfig>, String> {
    debug!("Listing sentinels");

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let sentinels = sqlite::get_sentinels(db.pool(), active_profile.id)
        .await
        .map_err(|e| {
            error!("Failed to list sentinels: {}", e);
            e.to_string()
        })?;

    debug!("Found {} sentinels", sentinels.len());
    Ok(sentinels.into_iter().map(SentinelConfig::from).collect())
}

/// Toggle a sentinel's active status
#[tauri::command]
pub async fn toggle_sentinel(
    sentinel_id: i64,
    is_active: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Toggling sentinel {} to active={}", sentinel_id, is_active);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::set_sentinel_active(db.pool(), sentinel_id, is_active)
        .await
        .map_err(|e| {
            error!("Failed to toggle sentinel: {}", e);
            e.to_string()
        })?;

    info!("Sentinel {} set to active={}", sentinel_id, is_active);
    Ok(())
}

/// Delete a sentinel
#[tauri::command]
pub async fn delete_sentinel(sentinel_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    debug!("Deleting sentinel {}", sentinel_id);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::delete_sentinel(db.pool(), sentinel_id)
        .await
        .map_err(|e| {
            error!("Failed to delete sentinel: {}", e);
            e.to_string()
        })?;

    info!("Deleted sentinel {}", sentinel_id);
    Ok(())
}

/// Update highest price seen for a sentinel (called during monitoring)
#[tauri::command]
pub async fn update_sentinel_price(
    sentinel_id: i64,
    highest_price: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::update_highest_price(db.pool(), sentinel_id, highest_price)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update sentinel configuration (SL/TP/trailing/sell%)
#[tauri::command]
pub async fn update_sentinel(
    sentinel_id: i64,
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Updating sentinel {} config", sentinel_id);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::update_sentinel(db.pool(), sentinel_id, stop_loss_pct, take_profit_pct, trailing_stop_pct, sell_percentage)
        .await
        .map_err(|e| {
            error!("Failed to update sentinel: {}", e);
            e.to_string()
        })?;

    info!("Updated sentinel {} config: SL={:?} TP={:?} TS={:?} sell={}%", 
          sentinel_id, stop_loss_pct, take_profit_pct, trailing_stop_pct, sell_percentage);
    Ok(())
}

/// Result from a sentinel check
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelCheckResult {
    pub checked: u32,
    pub triggered: u32,
    pub sold: Vec<String>,
    pub errors: Vec<String>,
    pub synced_removed: u32,
    pub synced_added: u32,
}

/// Run a sentinel check: compare current prices to SL/TP/trailing stops and execute sells.
/// Also syncs sentinels with portfolio (removes sold coins, adds new ones).
#[tauri::command]
pub async fn run_sentinel_check(
    state: State<'_, AppState>,
) -> Result<SentinelCheckResult, String> {
    info!("Running sentinel check");

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(&sqlite::get_profile_token(db.pool(), active_profile.id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Profile token not found")?)
        .map_err(|e| e.to_string())?;

    let client = RugplayClient::new(&token);

    // Fetch current portfolio
    let portfolio = client.get_portfolio().await.map_err(|e| {
        error!("Failed to fetch portfolio for sentinel check: {}", e);
        e.to_string()
    })?;

    let held_symbols: std::collections::HashSet<String> = portfolio
        .coin_holdings
        .iter()
        .map(|h| h.symbol.clone())
        .collect();

    // Load sentinel settings (blacklist) — these are in localStorage on the frontend,
    // so we pass them from the frontend. For auto-check we just work with DB sentinels.
    let sentinels = sqlite::get_sentinels(db.pool(), active_profile.id)
        .await
        .map_err(|e| e.to_string())?;

    let mut result = SentinelCheckResult {
        checked: 0,
        triggered: 0,
        sold: Vec::new(),
        errors: Vec::new(),
        synced_removed: 0,
        synced_added: 0,
    };

    // 1. Remove sentinels for coins no longer held
    for sentinel in &sentinels {
        if !held_symbols.contains(&sentinel.symbol) && sentinel.is_active {
            info!("Removing sentinel for {} (no longer held)", sentinel.symbol);
            if let Err(e) = sqlite::delete_sentinels_by_symbol(db.pool(), active_profile.id, &sentinel.symbol).await {
                result.errors.push(format!("Failed to remove sentinel for {}: {}", sentinel.symbol, e));
            } else {
                result.synced_removed += 1;
            }
        }
    }

    // 2. Check active sentinels against current prices
    let active_sentinels: Vec<_> = sentinels.iter().filter(|s| s.is_active && held_symbols.contains(&s.symbol)).collect();

    for sentinel in &active_sentinels {
        result.checked += 1;

        // Find current holding
        let holding = match portfolio.coin_holdings.iter().find(|h| h.symbol == sentinel.symbol) {
            Some(h) => h,
            None => continue,
        };

        let current_price = holding.current_price;
        let entry_price = sentinel.entry_price;

        // Update highest price seen
        if current_price > sentinel.highest_price_seen {
            let _ = sqlite::update_highest_price(db.pool(), sentinel.id, current_price).await;
        }

        let mut should_sell = false;
        let mut reason = String::new();

        // Check stop loss
        if let Some(sl_pct) = sentinel.stop_loss_pct {
            let sl_price = entry_price * (1.0 - sl_pct.abs() / 100.0);
            if current_price <= sl_price {
                should_sell = true;
                reason = format!("Stop loss triggered at {} (SL={:.1}%, target={})", current_price, sl_pct, sl_price);
            }
        }

        // Check take profit
        if !should_sell {
            if let Some(tp_pct) = sentinel.take_profit_pct {
                let tp_price = entry_price * (1.0 + tp_pct / 100.0);
                if current_price >= tp_price {
                    should_sell = true;
                    reason = format!("Take profit triggered at {} (TP={:.1}%, target={})", current_price, tp_pct, tp_price);
                }
            }
        }

        // Check trailing stop (skip if 0% - would always trigger)
        if !should_sell {
            if let Some(ts_pct) = sentinel.trailing_stop_pct {
                if ts_pct > 0.0 {
                    let highest = f64::max(sentinel.highest_price_seen, current_price);
                    let ts_price = highest * (1.0 - ts_pct / 100.0);
                    if current_price <= ts_price && current_price > entry_price {
                        should_sell = true;
                        reason = format!("Trailing stop triggered at {} (TS={:.1}%, highest={}, target={})", 
                                         current_price, ts_pct, highest, ts_price);
                    }
                }
            }
        }

        if should_sell {
            info!("Sentinel triggered for {}: {}", sentinel.symbol, reason);

            // Calculate sell amount
            let sell_qty = holding.quantity * (sentinel.sell_percentage / 100.0);
            let sell_qty = truncate_to_8_decimals(sell_qty);

            if sell_qty > 0.0 {
                let trade_request = TradeRequest {
                    trade_type: TradeType::Sell,
                    amount: sell_qty,
                };

                // Rate limit: small delay between trades to avoid 429 Too Many Requests
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                match client.trade(&sentinel.symbol, trade_request).await {
                    Ok(trade_response) => {
                        info!("Sentinel sell executed for {}: sold {} coins", sentinel.symbol, sell_qty);
                        result.triggered += 1;
                        result.sold.push(format!("{}: {} ({})", sentinel.symbol, reason, 
                                                 if trade_response.success { "success" } else { "failed" }));

                        // Mark sentinel as triggered
                        let _ = sqlite::mark_sentinel_triggered(db.pool(), sentinel.id).await;
                    }
                    Err(e) => {
                        error!("Failed to execute sentinel sell for {}: {}", sentinel.symbol, e);
                        result.errors.push(format!("Failed to sell {}: {}", sentinel.symbol, e));
                    }
                }
            }
        }
    }

    info!("Sentinel check complete: checked={}, triggered={}, removed={}", 
          result.checked, result.triggered, result.synced_removed);
    Ok(result)
}

/// Sync sentinels with portfolio: remove sentinels for sold coins, add defaults for new ones.
/// Called from frontend with blacklist info.
#[tauri::command]
pub async fn sync_sentinels(
    blacklist: Vec<String>,
    default_stop_loss_pct: Option<f64>,
    default_take_profit_pct: Option<f64>,
    default_trailing_stop_pct: Option<f64>,
    default_sell_percentage: f64,
    state: State<'_, AppState>,
) -> Result<SentinelCheckResult, String> {
    info!("Syncing sentinels with portfolio");

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(&sqlite::get_profile_token(db.pool(), active_profile.id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Profile token not found")?)
        .map_err(|e| e.to_string())?;

    let client = RugplayClient::new(&token);
    let portfolio = client.get_portfolio().await.map_err(|e| e.to_string())?;

    let held_symbols: std::collections::HashSet<String> = portfolio
        .coin_holdings
        .iter()
        .map(|h| h.symbol.clone())
        .collect();

    let blacklist_set: std::collections::HashSet<String> = blacklist.into_iter().collect();

    let sentinels = sqlite::get_sentinels(db.pool(), active_profile.id)
        .await
        .map_err(|e| e.to_string())?;

    let sentinel_symbols: std::collections::HashSet<String> = sentinels.iter().map(|s| s.symbol.clone()).collect();

    let mut result = SentinelCheckResult {
        checked: 0,
        triggered: 0,
        sold: Vec::new(),
        errors: Vec::new(),
        synced_removed: 0,
        synced_added: 0,
    };

    // Remove sentinels for coins no longer held
    for sentinel in &sentinels {
        if !held_symbols.contains(&sentinel.symbol) {
            if let Err(e) = sqlite::delete_sentinels_by_symbol(db.pool(), active_profile.id, &sentinel.symbol).await {
                warn!("Failed to remove sentinel for {}: {}", sentinel.symbol, e);
            } else {
                result.synced_removed += 1;
            }
        }
    }

    // Add sentinels for new holdings (not blacklisted, not already tracked)
    for holding in &portfolio.coin_holdings {
        if !sentinel_symbols.contains(&holding.symbol) && !blacklist_set.contains(&holding.symbol) {
            let entry_price = if holding.avg_purchase_price > 0.0 {
                holding.avg_purchase_price
            } else {
                holding.current_price
            };

            match sqlite::create_sentinel(
                db.pool(),
                active_profile.id,
                &holding.symbol,
                default_stop_loss_pct,
                default_take_profit_pct,
                default_trailing_stop_pct,
                default_sell_percentage,
                entry_price,
            ).await {
                Ok(_) => {
                    result.synced_added += 1;
                    debug!("Auto-created sentinel for {}", holding.symbol);
                }
                Err(e) => {
                    warn!("Failed to auto-create sentinel for {}: {}", holding.symbol, e);
                }
            }
        }
    }

    info!("Sentinel sync: removed={}, added={}", result.synced_removed, result.synced_added);
    Ok(result)
}

/// Update ALL sentinels with new settings (batch apply)
#[tauri::command]
pub async fn update_all_sentinels(
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    info!("Updating all sentinels with SL={:?} TP={:?} TS={:?} sell={}%",
          stop_loss_pct, take_profit_pct, trailing_stop_pct, sell_percentage);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let updated = sqlite::update_all_sentinels(
        db.pool(),
        active_profile.id,
        stop_loss_pct,
        take_profit_pct,
        trailing_stop_pct,
        sell_percentage,
    )
    .await
    .map_err(|e| {
        error!("Failed to batch update sentinels: {}", e);
        e.to_string()
    })?;

    info!("Batch updated {} sentinels", updated);
    Ok(updated)
}

/// Toggle ALL sentinels active/paused (global kill switch)
#[tauri::command]
pub async fn toggle_all_sentinels(
    is_active: bool,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    info!("Setting all sentinels active={}", is_active);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let updated = sqlite::set_all_sentinels_active(
        db.pool(),
        active_profile.id,
        is_active,
    )
    .await
    .map_err(|e| {
        error!("Failed to toggle all sentinels: {}", e);
        e.to_string()
    })?;

    info!("Toggled {} sentinels to active={}", updated, is_active);
    Ok(updated)
}
