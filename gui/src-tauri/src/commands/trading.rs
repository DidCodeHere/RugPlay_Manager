//! Trade commands for Tauri

use crate::AppState;
use rugplay_core::{TradeRequest, TradeType, truncate_to_8_decimals};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, error, info};

/// Trade direction from frontend
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TradeDirection {
    Buy,
    Sell,
}

/// Result of a trade execution
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResult {
    pub success: bool,
    pub trade_type: String,
    pub coins_amount: f64,
    pub usd_amount: f64,
    pub new_price: f64,
    pub price_impact: f64,
    pub new_balance: f64,
    pub message: String,
}

/// Execute a trade (buy or sell)
/// 
/// # Arguments
/// * `symbol` - Coin symbol (e.g., "BTC")
/// * `direction` - "BUY" or "SELL"
/// * `amount` - For BUY: USD amount to spend. For SELL: coin amount to sell.
#[tauri::command]
pub async fn execute_trade(
    symbol: String,
    direction: TradeDirection,
    amount: f64,
    state: State<'_, AppState>,
) -> Result<TradeResult, String> {
    info!("Executing {:?} trade for {} - amount: {}", direction, symbol, amount);

    if amount <= 0.0 {
        return Err("Amount must be greater than 0".to_string());
    }

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    // Get active profile's token
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

    // Convert direction to trade type
    let trade_type = match direction {
        TradeDirection::Buy => TradeType::Buy,
        TradeDirection::Sell => TradeType::Sell,
    };

    // For SELL, truncate to 8 decimal places to avoid precision errors
    let adjusted_amount = match direction {
        TradeDirection::Buy => amount,
        TradeDirection::Sell => {
            let truncated = truncate_to_8_decimals(amount);
            if truncated != amount {
                debug!("Truncated sell amount from {} to {}", amount, truncated);
            }
            truncated
        }
    };

    let request = TradeRequest {
        trade_type,
        amount: adjusted_amount,
    };

    match client.trade(&symbol, request).await {
        Ok(response) => {
            let (coins_amount, usd_amount, message) = match direction {
                TradeDirection::Buy => {
                    let coins = response.coins_bought.unwrap_or(0.0);
                    let cost = response.total_cost.unwrap_or(adjusted_amount);
                    (coins, cost, format!("Bought {:.8} {} for ${:.2}", coins, symbol, cost))
                }
                TradeDirection::Sell => {
                    let coins = response.coins_sold.unwrap_or(adjusted_amount);
                    let received = response.total_received.unwrap_or(0.0);
                    (coins, received, format!("Sold {:.8} {} for ${:.2}", coins, symbol, received))
                }
            };

            info!("Trade successful: {}", message);

            Ok(TradeResult {
                success: true,
                trade_type: response.trade_type,
                coins_amount,
                usd_amount,
                new_price: response.new_price,
                price_impact: response.price_impact,
                new_balance: response.new_balance,
                message,
            })
        }
        Err(e) => {
            error!("Trade failed: {}", e);
            Err(format!("Trade failed: {}", e))
        }
    }
}

/// Get the user's current balance
#[tauri::command]
pub async fn get_balance(state: State<'_, AppState>) -> Result<f64, String> {
    debug!("Fetching balance");

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
    let balance = client.get_balance().await.map_err(|e| {
        error!("Failed to fetch balance: {}", e);
        e.to_string()
    })?;

    Ok(balance)
}
