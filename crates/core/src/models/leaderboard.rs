//! Leaderboard-related models

use serde::{Deserialize, Serialize};

/// Full leaderboard response from /api/leaderboard
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardResponse {
    #[serde(default)]
    pub top_rugpullers: Vec<RugpullerEntry>,
    #[serde(default)]
    pub biggest_losers: Vec<LoserEntry>,
    #[serde(default)]
    pub cash_kings: Vec<WealthEntry>,
    #[serde(default)]
    pub paper_millionaires: Vec<WealthEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RugpullerEntry {
    pub user_id: serde_json::Value,
    pub username: String,
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub total_sold: serde_json::Value,
    #[serde(default)]
    pub total_bought: serde_json::Value,
    #[serde(default)]
    pub total_extracted: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoserEntry {
    pub user_id: serde_json::Value,
    pub username: String,
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub money_spent: serde_json::Value,
    #[serde(default)]
    pub money_received: serde_json::Value,
    #[serde(default)]
    pub current_value: serde_json::Value,
    #[serde(default)]
    pub total_loss: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WealthEntry {
    pub user_id: serde_json::Value,
    pub username: String,
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub base_currency_balance: serde_json::Value,
    #[serde(default)]
    pub coin_value: serde_json::Value,
    #[serde(default)]
    pub total_portfolio_value: serde_json::Value,
    #[serde(default)]
    pub liquidity_ratio: serde_json::Value,
}

fn parse_f64(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn parse_user_id(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

impl RugpullerEntry {
    pub fn user_id_str(&self) -> String { parse_user_id(&self.user_id) }
    pub fn total_sold_f64(&self) -> f64 { parse_f64(&self.total_sold) }
    pub fn total_bought_f64(&self) -> f64 { parse_f64(&self.total_bought) }
    pub fn total_extracted_f64(&self) -> f64 { parse_f64(&self.total_extracted) }
}

impl LoserEntry {
    pub fn user_id_str(&self) -> String { parse_user_id(&self.user_id) }
    pub fn total_loss_f64(&self) -> f64 { parse_f64(&self.total_loss) }
}

impl WealthEntry {
    pub fn user_id_str(&self) -> String { parse_user_id(&self.user_id) }
    pub fn total_portfolio_value_f64(&self) -> f64 { parse_f64(&self.total_portfolio_value) }
    pub fn base_currency_balance_f64(&self) -> f64 { parse_f64(&self.base_currency_balance) }
    pub fn coin_value_f64(&self) -> f64 { parse_f64(&self.coin_value) }
    pub fn liquidity_ratio_f64(&self) -> f64 { parse_f64(&self.liquidity_ratio) }
}
