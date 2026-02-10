//! Market-related models

use serde::{Deserialize, Serialize};

/// Market response from /api/market
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketResponse {
    pub coins: Vec<MarketCoin>,
    #[serde(default)]
    pub total: Option<u32>,
    #[serde(default)]
    pub page: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub total_pages: Option<u32>,
}

/// Coin in market listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketCoin {
    pub symbol: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub current_price: f64,
    pub market_cap: f64,
    #[serde(default)]
    pub volume_24h: f64,
    #[serde(default)]
    pub change_24h: f64,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub creator_name: Option<String>,
}

impl MarketCoin {
    /// Get full icon URL
    pub fn icon_url(&self) -> Option<String> {
        self.icon.as_ref().map(|i| {
            if i.starts_with("http") {
                i.clone()
            } else {
                format!("https://rugplay.com/{}", i)
            }
        })
    }
}

/// Recent trades response from /api/trades/recent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentTradesResponse {
    pub trades: Vec<RecentTrade>,
}

/// Individual trade from live feed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTrade {
    #[serde(rename(deserialize = "type"))]
    pub trade_type: String,
    pub username: String,
    #[serde(default)]
    pub user_image: Option<String>,
    pub amount: f64,
    pub coin_symbol: String,
    pub coin_name: String,
    #[serde(default)]
    pub coin_icon: Option<String>,
    pub total_value: f64,
    pub price: f64,
    pub timestamp: i64,
    pub user_id: String,
}

impl RecentTrade {
    /// Check if this is a buy trade
    pub fn is_buy(&self) -> bool {
        self.trade_type.to_uppercase() == "BUY"
    }

    /// Get full user image URL
    pub fn user_image_url(&self) -> Option<String> {
        self.user_image.as_ref().map(|i| {
            if i.starts_with("http") {
                i.clone()
            } else {
                format!("https://rugplay.com/{}", i)
            }
        })
    }
}

/// Coin holders response from /api/coin/{SYMBOL}/holders
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinHoldersResponse {
    pub coin_symbol: String,
    pub total_holders: u32,
    pub circulating_supply: f64,
    pub pool_info: PoolInfo,
    pub holders: Vec<Holder>,
}

/// Pool information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolInfo {
    pub coin_amount: f64,
    pub base_currency_amount: f64,
    pub current_price: f64,
}

/// Individual holder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Holder {
    pub rank: u32,
    pub user_id: u32,
    pub username: String,
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    pub quantity: f64,
    pub percentage: f64,
    pub liquidation_value: f64,
}

impl Holder {
    /// Get full avatar URL
    pub fn image_url(&self) -> Option<String> {
        self.image.as_ref().map(|i| {
            if i.starts_with("http") {
                i.clone()
            } else {
                format!("https://rugplay.com/{}", i)
            }
        })
    }
}

// ─── Coin Comments ───────────────────────────────────────────────────

/// Response from GET /api/coin/{SYMBOL}/comments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinCommentsResponse {
    pub comments: Vec<CoinComment>,
}

/// Individual comment on a coin
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinComment {
    pub id: i64,
    pub content: String,
    pub user_id: i64,
    pub user_username: String,
    #[serde(default)]
    pub user_name: Option<String>,
    #[serde(default)]
    pub user_image: Option<String>,
    pub likes_count: i32,
    #[serde(default)]
    pub is_liked_by_user: bool,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// Response from POST /api/coin/{SYMBOL}/comments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostCommentResponse {
    pub comment: CoinComment,
}
