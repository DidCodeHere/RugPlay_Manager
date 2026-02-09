//! Transaction history commands - fetches from Rugplay API

use crate::AppState;
use rugplay_core::ApiTransaction;
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, error};

/// Transaction record for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRecord {
    pub id: i64,
    pub trade_type: String,
    pub symbol: String,
    pub coin_name: String,
    pub coin_icon: Option<String>,
    pub coin_amount: f64,
    pub price: f64,
    pub usd_value: f64,
    pub timestamp: String,
    pub is_transfer: bool,
    pub is_incoming: bool,
    pub sender: Option<String>,
    pub recipient: Option<String>,
}

impl From<ApiTransaction> for TransactionRecord {
    fn from(tx: ApiTransaction) -> Self {
        let (symbol, coin_name, coin_icon) = match &tx.coin {
            Some(coin) => (
                coin.symbol.clone(),
                coin.name.clone(),
                coin.icon.clone(),
            ),
            None => ("???".to_string(), "Unknown".to_string(), None),
        };

        Self {
            id: tx.id,
            trade_type: tx.trade_type.clone(),
            symbol,
            coin_name,
            coin_icon,
            coin_amount: tx.quantity,
            price: tx.price_per_coin,
            usd_value: tx.total_base_currency_amount,
            timestamp: tx.timestamp,
            is_transfer: tx.is_transfer,
            is_incoming: tx.is_incoming,
            sender: tx.sender,
            recipient: tx.recipient,
        }
    }
}

/// Response with transactions and pagination info
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionListResponse {
    pub transactions: Vec<TransactionRecord>,
    pub total: u32,
    pub page: u32,
    pub limit: u32,
}

/// Get transaction history from the Rugplay API
#[tauri::command]
pub async fn get_transactions(
    page: u32,
    limit: Option<u32>,
    trade_type: Option<String>,
    search: Option<String>,
    state: State<'_, AppState>,
) -> Result<TransactionListResponse, String> {
    let per_page = limit.unwrap_or(25);
    debug!("Fetching transactions page {} with {} per page", page, per_page);

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
    let api_response = client
        .get_transactions(
            page,
            per_page,
            trade_type.as_deref(),
            search.as_deref(),
        )
        .await
        .map_err(|e| {
            error!("Failed to fetch transactions: {}", e);
            e.to_string()
        })?;

    debug!(
        "Fetched {} transactions (total: {})",
        api_response.transactions.len(),
        api_response.total
    );

    Ok(TransactionListResponse {
        transactions: api_response
            .transactions
            .into_iter()
            .map(TransactionRecord::from)
            .collect(),
        total: api_response.total,
        page: api_response.page,
        limit: api_response.limit,
    })
}

/// Get list of all symbols the user has traded (from API transactions)
#[tauri::command]
pub async fn get_traded_symbols(state: State<'_, AppState>) -> Result<Vec<String>, String> {
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
    let api_response = client
        .get_transactions(1, 100, None, None)
        .await
        .map_err(|e| e.to_string())?;

    let mut symbols: Vec<String> = api_response
        .transactions
        .iter()
        .filter_map(|tx| tx.coin.as_ref().map(|c| c.symbol.clone()))
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect();
    symbols.sort();

    Ok(symbols)
}

/// Log a transaction (called internally after trades)
#[tauri::command]
pub async fn log_transaction(
    symbol: String,
    trade_type: String,
    coin_amount: f64,
    price: f64,
    usd_value: f64,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    debug!("Logging transaction: {} {} @ {}", trade_type, symbol, price);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let id = sqlite::log_transaction(
        db.pool(),
        active_profile.id,
        &symbol,
        &trade_type,
        coin_amount,
        price,
        usd_value,
    )
    .await
    .map_err(|e| {
        error!("Failed to log transaction: {}", e);
        e.to_string()
    })?;

    debug!("Transaction logged with id {}", id);
    Ok(id)
}
