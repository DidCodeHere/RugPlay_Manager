//! Reward-related data models for the /api/rewards/claim endpoint

use serde::{Deserialize, Serialize};

/// Response from `GET /api/rewards/claim` — checks reward eligibility
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardStatusResponse {
    /// Whether the user can currently claim a reward
    pub can_claim: bool,
    /// Reward amount (if claimable)
    #[serde(default)]
    pub reward_amount: f64,
    /// Base reward before prestige bonus
    #[serde(default)]
    pub base_reward: f64,
    /// Prestige bonus amount
    #[serde(default)]
    pub prestige_bonus: f64,
    /// User's prestige level
    #[serde(default)]
    pub prestige_level: u32,
    /// Milliseconds remaining until next claim (0 if claimable)
    /// NOTE: The server returns this in milliseconds, convert to seconds with / 1000
    #[serde(default)]
    pub time_remaining: i64,
    /// ISO timestamp of when next claim is available
    pub next_claim_time: Option<String>,
    /// Total rewards claimed all time
    #[serde(default)]
    pub total_rewards_claimed: f64,
    /// ISO timestamp of last reward claim
    pub last_reward_claim: Option<String>,
    /// Current login streak (days)
    #[serde(default)]
    pub login_streak: u32,
}

/// Response from `POST /api/rewards/claim` — actually claims the reward
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardClaimResponse {
    /// Whether the claim succeeded
    pub success: bool,
    /// Amount rewarded
    #[serde(default)]
    pub reward_amount: f64,
    /// User's new balance after claiming
    #[serde(default)]
    pub new_balance: f64,
    /// Total rewards claimed all time
    #[serde(default)]
    pub total_rewards_claimed: f64,
    /// Current login streak
    #[serde(default)]
    pub login_streak: u32,
    /// ISO timestamp of when next claim is available
    pub next_claim_time: Option<String>,
}
