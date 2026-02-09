//! Trade-related models

use serde::{Deserialize, Serialize};

/// Trade type (buy or sell)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TradeType {
    Buy,
    Sell,
}

/// Request to execute a trade
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRequest {
    #[serde(rename = "type")]
    pub trade_type: TradeType,
    /// For BUY: amount in USD to spend
    /// For SELL: amount in coins to sell
    pub amount: f64,
}

/// Response from a trade execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResponse {
    pub success: bool,
    #[serde(rename = "type")]
    pub trade_type: String,
    #[serde(default)]
    pub coins_bought: Option<f64>,
    #[serde(default)]
    pub coins_sold: Option<f64>,
    #[serde(default)]
    pub total_cost: Option<f64>,
    #[serde(default)]
    pub total_received: Option<f64>,
    pub new_price: f64,
    pub price_impact: f64,
    #[serde(default)]
    pub new_balance: f64,
}

/// Transaction record stored in local database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub symbol: String,
    pub trade_type: TradeType,
    /// Amount of coins traded
    pub coin_amount: f64,
    /// Price at execution
    pub price: f64,
    /// Total USD value
    pub usd_value: f64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

// ============================================================================
// API Transaction Types (from Rugplay /api/transactions endpoint)
// ============================================================================

/// Response from GET /api/transactions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTransactionsResponse {
    pub transactions: Vec<ApiTransaction>,
    /// Total number of transactions (API returns this as a string)
    #[serde(deserialize_with = "deserialize_string_or_number")]
    pub total: u32,
    pub page: u32,
    pub limit: u32,
}

/// Individual transaction from the Rugplay API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTransaction {
    pub id: i64,
    #[serde(rename(deserialize = "type"))]
    pub trade_type: String,
    pub quantity: f64,
    pub price_per_coin: f64,
    pub total_base_currency_amount: f64,
    pub timestamp: String,
    #[serde(default)]
    pub recipient_user_id: Option<String>,
    #[serde(default)]
    pub sender_user_id: Option<String>,
    #[serde(default)]
    pub coin: Option<ApiTransactionCoin>,
    #[serde(default)]
    pub is_transfer: bool,
    #[serde(default)]
    pub is_incoming: bool,
    #[serde(default)]
    pub is_coin_transfer: bool,
    #[serde(default)]
    pub recipient: Option<String>,
    #[serde(default)]
    pub sender: Option<String>,
}

/// Coin info embedded in an API transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTransactionCoin {
    pub id: u32,
    pub name: String,
    pub symbol: String,
    #[serde(default)]
    pub icon: Option<String>,
}

/// Deserialize a value that may be a string or number into u32
fn deserialize_string_or_number<'de, D>(deserializer: D) -> std::result::Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct StringOrNumber;

    impl<'de> de::Visitor<'de> for StringOrNumber {
        type Value = u32;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or number")
        }

        fn visit_u64<E: de::Error>(self, v: u64) -> std::result::Result<u32, E> {
            Ok(v as u32)
        }

        fn visit_i64<E: de::Error>(self, v: i64) -> std::result::Result<u32, E> {
            Ok(v as u32)
        }

        fn visit_str<E: de::Error>(self, v: &str) -> std::result::Result<u32, E> {
            v.parse::<u32>().map_err(de::Error::custom)
        }
    }

    deserializer.deserialize_any(StringOrNumber)
}

/// Truncate a float to 8 decimal places (server precision limit)
/// 
/// # Important
/// Always use this before selling coins to avoid "insufficient coins" errors.
pub fn truncate_to_8_decimals(value: f64) -> f64 {
    (value * 1e8).floor() / 1e8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_precision() {
        let bought = 0.0000225818858502235264;
        let truncated = truncate_to_8_decimals(bought);
        assert_eq!(truncated, 0.00002258);
    }
}
