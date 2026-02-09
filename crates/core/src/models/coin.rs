//! Coin-related models

use serde::{Deserialize, Serialize};

/// API response wrapper for coin details
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinDetailsResponse {
    pub coin: CoinDetails,
    #[serde(default)]
    pub candlestick_data: Vec<CandlestickPoint>,
    #[serde(default)]
    pub volume_data: Vec<VolumePoint>,
    #[serde(default)]
    pub timeframe: Option<String>,
}

/// Candlestick data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandlestickPoint {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

/// Volume data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumePoint {
    pub time: i64,
    pub volume: f64,
}

/// Detailed coin information from Rugplay API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinDetails {
    #[serde(deserialize_with = "deserialize_id")]
    pub id: String,
    pub symbol: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub current_price: f64,
    pub market_cap: f64,
    pub pool_coin_amount: f64,
    pub pool_base_currency_amount: f64,
    #[serde(default)]
    pub circulating_supply: f64,
    #[serde(default, deserialize_with = "deserialize_id_option")]
    pub creator_id: Option<String>,
    #[serde(default)]
    pub is_locked: bool,
    #[serde(default)]
    pub volume_24h: f64,
    #[serde(default)]
    pub change_24h: f64,
}

/// Deserialize ID that can be either string or number
fn deserialize_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum IdValue {
        String(String),
        Number(i64),
    }
    
    match IdValue::deserialize(deserializer)? {
        IdValue::String(s) => Ok(s),
        IdValue::Number(n) => Ok(n.to_string()),
    }
}

/// Deserialize optional ID that can be either string or number
fn deserialize_id_option<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum IdValue {
        String(String),
        Number(i64),
    }
    
    Ok(Option::<IdValue>::deserialize(deserializer)?.map(|v| match v {
        IdValue::String(s) => s,
        IdValue::Number(n) => n.to_string(),
    }))
}

/// Simplified coin data for lists and portfolios
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinSummary {
    pub symbol: String,
    pub name: String,
    pub current_price: f64,
    pub change_24h: f64,
}

/// User's holding of a specific coin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Holding {
    pub symbol: String,
    pub quantity: f64,
    pub avg_entry_price: f64,
}

impl Holding {
    /// Calculate current value at given price
    pub fn value_at(&self, current_price: f64) -> f64 {
        self.quantity * current_price
    }

    /// Calculate profit/loss percentage
    pub fn pnl_percent(&self, current_price: f64) -> f64 {
        if self.avg_entry_price == 0.0 {
            return 0.0;
        }
        ((current_price - self.avg_entry_price) / self.avg_entry_price) * 100.0
    }
}
