//! User-related models

use serde::{Deserialize, Serialize};

/// Session response from /api/auth/get-session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub session: SessionInfo,
    pub user: UserData,
}

impl SessionResponse {
    /// Convert to UserProfile for internal use
    pub fn into_user_profile(self) -> UserProfile {
        UserProfile {
            id: self.user.id,
            username: self.user.username,
            name: self.user.name,
            email: self.user.email,
            image: self.user.image,
            balance: self.user.base_currency_balance
                .parse::<f64>()
                .unwrap_or(0.0),
            is_admin: self.user.is_admin,
            is_banned: self.user.is_banned,
            session_expires_at: self.session.expires_at,
        }
    }
}

/// Session info from the API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub expires_at: String,
    pub token: String,
    pub user_id: String,
    pub id: String,
}

/// User data from the session response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserData {
    pub id: String,
    pub name: String,
    pub username: String,
    pub email: String,
    pub email_verified: bool,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub base_currency_balance: String,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub is_banned: bool,
}

/// User profile information (internal representation)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub balance: f64,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub is_banned: bool,
    #[serde(default)]
    pub session_expires_at: String,
}

/// Locally stored profile (encrypted token stored separately)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: i64,
    pub username: String,
    pub user_id: Option<String>,
    pub last_verified: Option<chrono::DateTime<chrono::Utc>>,
    pub is_active: bool,
}

/// Summary of a profile for display in UI (no sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSummary {
    pub id: i64,
    pub username: String,
    pub last_verified: Option<String>,
}

impl From<Profile> for ProfileSummary {
    fn from(p: Profile) -> Self {
        ProfileSummary {
            id: p.id,
            username: p.username,
            last_verified: p.last_verified.map(|dt| dt.to_rfc3339()),
        }
    }
}

// ─── Public User Profile (for Mirror whale tracking) ─────────────────

/// Response from `GET /api/user/{USER_ID}`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublicProfileResponse {
    pub profile: UserPublicInfo,
    pub stats: UserPublicStats,
    #[serde(default, rename = "createdCoins")]
    pub created_coins: Vec<serde_json::Value>,
    #[serde(default, rename = "recentTransactions")]
    pub recent_transactions: Vec<serde_json::Value>,
}

/// Public profile info for a user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublicInfo {
    pub id: serde_json::Value, // Can be number or string
    pub name: String,
    pub username: String,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
}

/// Public stats for a user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPublicStats {
    #[serde(default)]
    pub base_currency_balance: serde_json::Value, // Can be number or string
    #[serde(default)]
    pub buy_volume_24h: serde_json::Value,
    #[serde(default)]
    pub coins_created: serde_json::Value,
    #[serde(default)]
    pub holdings_count: serde_json::Value,
    #[serde(default)]
    pub holdings_value: serde_json::Value,
    #[serde(default)]
    pub sell_volume_24h: serde_json::Value,
    #[serde(default)]
    pub total_buy_volume: serde_json::Value,
    #[serde(default)]
    pub total_portfolio_value: serde_json::Value,
    #[serde(default)]
    pub total_sell_volume: serde_json::Value,
    #[serde(default)]
    pub total_transactions: serde_json::Value,
    #[serde(default)]
    pub transactions_24h: serde_json::Value,
}

impl UserPublicStats {
    /// Helper to parse a JSON value as f64 (handles both string and number)
    fn parse_f64(v: &serde_json::Value) -> f64 {
        match v {
            serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
            serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
            _ => 0.0,
        }
    }

    pub fn balance(&self) -> f64 {
        Self::parse_f64(&self.base_currency_balance)
    }

    pub fn total_portfolio_value_f64(&self) -> f64 {
        Self::parse_f64(&self.total_portfolio_value)
    }

    pub fn holdings_count_u32(&self) -> u32 {
        match &self.holdings_count {
            serde_json::Value::Number(n) => n.as_u64().unwrap_or(0) as u32,
            serde_json::Value::String(s) => s.parse().unwrap_or(0),
            _ => 0,
        }
    }

    pub fn total_volume(&self) -> f64 {
        Self::parse_f64(&self.total_buy_volume) + Self::parse_f64(&self.total_sell_volume)
    }
}
