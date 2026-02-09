//! Portfolio commands for Tauri

use crate::AppState;
use rugplay_core::{CoinHoldersResponse, MarketResponse, PortfolioResponse, PortfolioSummary, RecentTrade};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use tauri::State;
use tracing::{debug, error, info};

/// Get the current user's portfolio with all holdings
#[tauri::command]
pub async fn get_portfolio(state: State<'_, AppState>) -> Result<PortfolioResponse, String> {
    debug!("Fetching portfolio");

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
    let portfolio = client.get_portfolio().await.map_err(|e| {
        error!("Failed to fetch portfolio: {}", e);
        e.to_string()
    })?;

    info!(
        "Portfolio fetched: {} holdings, ${:.2} total",
        portfolio.coin_holdings.len(),
        portfolio.total_value
    );

    Ok(portfolio)
}

/// Get a summary of the portfolio for header display
#[tauri::command]
pub async fn get_portfolio_summary(state: State<'_, AppState>) -> Result<PortfolioSummary, String> {
    let portfolio = get_portfolio(state).await?;
    Ok(PortfolioSummary::from(&portfolio))
}

/// Get market coins with sorting
#[tauri::command]
pub async fn get_market(
    page: u32,
    limit: u32,
    sort_by: String,
    sort_order: String,
    search: Option<String>,
    state: State<'_, AppState>,
) -> Result<MarketResponse, String> {
    debug!("Fetching market page {} with {} items, search={:?}", page, limit, search);

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
    let market = client
        .get_market(page, limit, &sort_by, &sort_order, search.as_deref())
        .await
        .map_err(|e| {
            error!("Failed to fetch market: {}", e);
            e.to_string()
        })?;

    debug!("Market fetched: {} coins", market.coins.len());
    Ok(market)
}

/// Get coin holders
#[tauri::command]
pub async fn get_coin_holders(
    symbol: String,
    limit: u32,
    state: State<'_, AppState>,
) -> Result<CoinHoldersResponse, String> {
    debug!("Fetching holders for {}", symbol);

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
    let holders = client.get_coin_holders(&symbol, limit).await.map_err(|e| {
        error!("Failed to fetch holders: {}", e);
        e.to_string()
    })?;

    debug!("Holders fetched: {} for {}", holders.total_holders, symbol);
    Ok(holders)
}

/// Get detailed coin information
#[tauri::command]
pub async fn get_coin_details(
    symbol: String,
    state: State<'_, AppState>,
) -> Result<rugplay_core::CoinDetails, String> {
    debug!("Fetching coin details for {}", symbol);

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
    let coin = client.get_coin(&symbol).await.map_err(|e| {
        error!("Failed to fetch coin details: {}", e);
        e.to_string()
    })?;

    debug!("Coin details fetched: {} @ ${}", coin.symbol, coin.current_price);
    Ok(coin)
}

/// Get detailed coin information with chart data
#[tauri::command]
pub async fn get_coin_with_chart(
    symbol: String,
    timeframe: Option<String>,
    state: State<'_, AppState>,
) -> Result<rugplay_core::CoinDetailsResponse, String> {
    let tf = timeframe.unwrap_or_else(|| "1h".to_string());
    debug!("Fetching coin with chart for {} ({})", symbol, tf);

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
    let details = client.get_coin_with_chart(&symbol, &tf).await.map_err(|e| {
        error!("Failed to fetch coin with chart: {}", e);
        e.to_string()
    })?;

    debug!("Coin with chart fetched: {} @ ${}, {} candles", 
           details.coin.symbol, details.coin.current_price, details.candlestick_data.len());
    Ok(details)
}

/// Get recent trades from the live feed
#[tauri::command]
pub async fn get_recent_trades(
    limit: u32,
    state: State<'_, AppState>,
) -> Result<Vec<RecentTrade>, String> {
    debug!("Fetching {} recent trades", limit);

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
    let trades = client.get_recent_trades(limit).await.map_err(|e| {
        error!("Failed to fetch recent trades: {}", e);
        e.to_string()
    })?;

    // Filter out transfers — only show actual BUY/SELL trades
    let trades: Vec<RecentTrade> = trades
        .into_iter()
        .filter(|t| {
            let tt = t.trade_type.to_uppercase();
            tt == "BUY" || tt == "SELL"
        })
        .collect();

    debug!("Fetched {} recent trades (transfers filtered)", trades.len());
    Ok(trades)
}
