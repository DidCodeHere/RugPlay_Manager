//! Trading API operations with validation

use crate::RugplayClient;
use rugplay_core::{
    CoinDetails, Error, Result, TradeRequest, TradeResponse, TradeType,
    truncate_to_8_decimals,
};
use tracing::{info, warn};

/// Buy a coin with USD amount
/// 
/// # Arguments
/// * `client` - The authenticated Rugplay client
/// * `symbol` - Coin symbol (e.g., "PEPE")
/// * `usd_amount` - Amount in USD to spend
/// 
/// # Returns
/// Trade response with coins bought and new price
pub async fn buy_coin(
    client: &RugplayClient,
    symbol: &str,
    usd_amount: f64,
) -> Result<TradeResponse> {
    if usd_amount <= 0.0 {
        return Err(Error::InvalidData("USD amount must be positive".to_string()));
    }

    let request = TradeRequest {
        trade_type: TradeType::Buy,
        amount: usd_amount,
    };

    info!("Buying {} worth of {}", usd_amount, symbol);
    client.trade(symbol, request).await
}

/// Sell a coin for USD
/// 
/// # Arguments
/// * `client` - The authenticated Rugplay client
/// * `symbol` - Coin symbol (e.g., "PEPE")
/// * `coin_amount` - Amount of coins to sell (will be truncated to 8 decimals)
/// 
/// # Important
/// The coin amount is automatically truncated to 8 decimal places
/// to match server precision and avoid "insufficient coins" errors.
pub async fn sell_coin(
    client: &RugplayClient,
    symbol: &str,
    coin_amount: f64,
) -> Result<TradeResponse> {
    if coin_amount <= 0.0 {
        return Err(Error::InvalidData("Coin amount must be positive".to_string()));
    }

    // CRITICAL: Truncate to 8 decimals to match server precision
    let truncated_amount = truncate_to_8_decimals(coin_amount);
    
    if truncated_amount != coin_amount {
        warn!(
            "Truncated coin amount from {} to {} for {}",
            coin_amount, truncated_amount, symbol
        );
    }

    let request = TradeRequest {
        trade_type: TradeType::Sell,
        amount: truncated_amount,
    };

    info!("Selling {} {} coins", truncated_amount, symbol);
    client.trade(symbol, request).await
}

/// Get coin details with liquidity check
pub async fn get_coin_with_liquidity_check(
    client: &RugplayClient,
    symbol: &str,
    min_liquidity: f64,
) -> Result<CoinDetails> {
    let coin = client.get_coin(symbol).await?;

    if coin.pool_base_currency_amount < min_liquidity {
        warn!(
            "Coin {} has low liquidity: ${} < ${}",
            symbol, coin.pool_base_currency_amount, min_liquidity
        );
    }

    Ok(coin)
}

/// Calculate expected slippage for a trade
/// 
/// Uses the constant product formula: x * y = k
pub fn calculate_slippage(
    pool_coins: f64,
    pool_usd: f64,
    trade_usd: f64,
) -> f64 {
    let current_price = pool_usd / pool_coins;
    let new_pool_usd = pool_usd + trade_usd;
    let new_pool_coins = (pool_coins * pool_usd) / new_pool_usd;
    let coins_received = pool_coins - new_pool_coins;
    let execution_price = trade_usd / coins_received;
    
    ((execution_price - current_price) / current_price) * 100.0
}
