//! User-related API operations

use crate::RugplayClient;
use rugplay_core::{RewardClaimResponse, RewardStatusResponse, Result, UserProfile};

/// Fetch and validate user profile
pub async fn fetch_user_profile(client: &RugplayClient) -> Result<UserProfile> {
    client.get_profile().await
}

/// Check reward claim status
pub async fn get_reward_status(client: &RugplayClient) -> Result<RewardStatusResponse> {
    client.get_reward_status().await
}

/// Claim daily reward if available
pub async fn claim_reward(client: &RugplayClient) -> Result<RewardClaimResponse> {
    client.claim_daily_reward().await
}
