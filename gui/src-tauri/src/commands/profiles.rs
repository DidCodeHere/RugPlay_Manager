//! Tauri commands for user profiles and leaderboard

use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::Serialize;
use tauri::Manager;

// ─── User Profile Response ──────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfileFullResponse {
    pub user_id: String,
    pub username: String,
    pub name: String,
    pub bio: Option<String>,
    pub image: Option<String>,
    // Stats
    pub balance: f64,
    pub holdings_count: u32,
    pub holdings_value: f64,
    pub total_portfolio_value: f64,
    pub total_buy_volume: f64,
    pub total_sell_volume: f64,
    pub total_transactions: u32,
    pub transactions_24h: u32,
    pub buy_volume_24h: f64,
    pub sell_volume_24h: f64,
    pub coins_created: u32,
    // Created coins
    pub created_coins: Vec<UserCreatedCoin>,
    // Recent transactions
    pub recent_transactions: Vec<UserTransaction>,
    // Local reputation
    pub reputation: Option<ReputationInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCreatedCoin {
    pub symbol: String,
    pub name: String,
    pub icon: Option<String>,
    pub current_price: f64,
    pub market_cap: f64,
    pub volume_24h: f64,
    pub change_24h: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTransaction {
    pub id: i64,
    pub trade_type: String,
    pub coin_symbol: String,
    pub coin_name: String,
    pub coin_icon: Option<String>,
    pub quantity: f64,
    pub price_per_coin: f64,
    pub total_value: f64,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationInfo {
    pub score: f64,
    pub rug_pulls: i64,
    pub leaderboard_appearances: i64,
    pub total_extracted: f64,
    pub last_updated: Option<String>,
}

// ─── Leaderboard Response ───────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardFullResponse {
    pub top_rugpullers: Vec<LeaderboardUser>,
    pub biggest_losers: Vec<LeaderboardUser>,
    pub cash_kings: Vec<LeaderboardUser>,
    pub paper_millionaires: Vec<LeaderboardUser>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardUser {
    pub rank: u32,
    pub user_id: String,
    pub username: String,
    pub name: String,
    pub image: Option<String>,
    pub primary_value: f64,
    pub secondary_value: f64,
    pub label: String,
    pub reputation_score: Option<f64>,
}

// ─── Helper: Build an authenticated client ──────────────────────────

async fn build_client(app_handle: &tauri::AppHandle) -> Result<RugplayClient, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    let pool = db.pool();

    let profiles = sqlite::list_profiles(pool)
        .await
        .map_err(|e| e.to_string())?;
    let active = profiles
        .into_iter()
        .find(|p| p.is_active)
        .ok_or("No active profile")?;

    let encrypted = sqlite::get_profile_token(pool, active.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No token found for active profile")?;

    let token = state
        .encryptor
        .decrypt(&encrypted)
        .map_err(|e| e.to_string())?;

    Ok(RugplayClient::new(&token))
}

// ─── Commands ───────────────────────────────────────────────────────

fn parse_f64(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn parse_u32(v: &serde_json::Value) -> u32 {
    match v {
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0) as u32,
        serde_json::Value::String(s) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn parse_user_id(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[tauri::command]
pub async fn get_user_profile_full(
    app_handle: tauri::AppHandle,
    user_id: String,
) -> Result<UserProfileFullResponse, String> {
    let client = build_client(&app_handle).await?;

    let profile = client
        .get_user_profile(&user_id)
        .await
        .map_err(|e| format!("Failed to fetch profile: {}", e))?;

    let uid = parse_user_id(&profile.profile.id);

    // Parse created coins
    let created_coins: Vec<UserCreatedCoin> = profile
        .created_coins
        .iter()
        .filter_map(|v| {
            let obj = v.as_object()?;
            Some(UserCreatedCoin {
                symbol: obj.get("symbol")?.as_str()?.to_string(),
                name: obj.get("name")?.as_str()?.to_string(),
                icon: obj.get("icon").and_then(|v| v.as_str()).map(String::from),
                current_price: parse_f64(obj.get("currentPrice").unwrap_or(&serde_json::Value::Null)),
                market_cap: parse_f64(obj.get("marketCap").unwrap_or(&serde_json::Value::Null)),
                volume_24h: parse_f64(obj.get("volume24h").unwrap_or(&serde_json::Value::Null)),
                change_24h: parse_f64(obj.get("change24h").unwrap_or(&serde_json::Value::Null)),
            })
        })
        .collect();

    // Parse recent transactions
    let recent_transactions: Vec<UserTransaction> = profile
        .recent_transactions
        .iter()
        .filter_map(|v| {
            let obj = v.as_object()?;
            Some(UserTransaction {
                id: obj.get("id")?.as_i64()?,
                trade_type: obj.get("type")?.as_str()?.to_string(),
                coin_symbol: obj.get("coinSymbol").and_then(|v| v.as_str()).unwrap_or("???").to_string(),
                coin_name: obj.get("coinName").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                coin_icon: obj.get("coinIcon").and_then(|v| v.as_str()).map(String::from),
                quantity: parse_f64(obj.get("quantity").unwrap_or(&serde_json::Value::Null)),
                price_per_coin: parse_f64(obj.get("pricePerCoin").unwrap_or(&serde_json::Value::Null)),
                total_value: parse_f64(obj.get("totalBaseCurrencyAmount").unwrap_or(&serde_json::Value::Null)),
                timestamp: obj.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            })
        })
        .collect();

    // Fetch local reputation
    let reputation = {
        let state = app_handle.state::<crate::AppState>();
        let db_guard = state.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            sqlite::get_reputation(db.pool(), &uid)
                .await
                .ok()
                .flatten()
                .map(|r| ReputationInfo {
                    score: r.score,
                    rug_pulls: r.rug_pulls,
                    leaderboard_appearances: r.leaderboard_appearances,
                    total_extracted: r.total_extracted,
                    last_updated: r.last_updated,
                })
        } else {
            None
        }
    };

    Ok(UserProfileFullResponse {
        user_id: uid,
        username: profile.profile.username,
        name: profile.profile.name,
        bio: profile.profile.bio,
        image: profile.profile.image,
        balance: profile.stats.balance(),
        holdings_count: profile.stats.holdings_count_u32(),
        holdings_value: parse_f64(&profile.stats.holdings_value),
        total_portfolio_value: profile.stats.total_portfolio_value_f64(),
        total_buy_volume: parse_f64(&profile.stats.total_buy_volume),
        total_sell_volume: parse_f64(&profile.stats.total_sell_volume),
        total_transactions: parse_u32(&profile.stats.total_transactions),
        transactions_24h: parse_u32(&profile.stats.transactions_24h),
        buy_volume_24h: parse_f64(&profile.stats.buy_volume_24h),
        sell_volume_24h: parse_f64(&profile.stats.sell_volume_24h),
        coins_created: parse_u32(&profile.stats.coins_created),
        created_coins,
        recent_transactions,
        reputation,
    })
}

#[tauri::command]
pub async fn get_leaderboard(
    app_handle: tauri::AppHandle,
) -> Result<LeaderboardFullResponse, String> {
    let client = build_client(&app_handle).await?;

    let lb = client
        .get_leaderboard()
        .await
        .map_err(|e| format!("Failed to fetch leaderboard: {}", e))?;

    // Update reputation scores for rugpullers that appear on the leaderboard
    {
        let state = app_handle.state::<crate::AppState>();
        let db_guard = state.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            for entry in &lb.top_rugpullers {
                let uid = entry.user_id_str();
                let _ = sqlite::record_leaderboard_rugpuller(
                    db.pool(),
                    &uid,
                    &entry.username,
                    entry.total_extracted_f64(),
                )
                .await;
            }
        }
    }

    // Fetch reputation scores for all users in the leaderboard
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let pool = db_guard.as_ref().map(|db| db.pool());

    let map_rugpuller = |entry: &rugplay_core::RugpullerEntry, rank: u32| -> LeaderboardUser {
        let uid = entry.user_id_str();
        LeaderboardUser {
            rank,
            user_id: uid,
            username: entry.username.clone(),
            name: entry.name.clone(),
            image: entry.image.clone(),
            primary_value: entry.total_extracted_f64(),
            secondary_value: entry.total_sold_f64(),
            label: "extracted".to_string(),
            reputation_score: None,
        }
    };

    let map_loser = |entry: &rugplay_core::LoserEntry, rank: u32| -> LeaderboardUser {
        LeaderboardUser {
            rank,
            user_id: entry.user_id_str(),
            username: entry.username.clone(),
            name: entry.name.clone(),
            image: entry.image.clone(),
            primary_value: entry.total_loss_f64(),
            secondary_value: 0.0,
            label: "lost".to_string(),
            reputation_score: None,
        }
    };

    let map_wealth = |entry: &rugplay_core::WealthEntry, rank: u32, label: &str| -> LeaderboardUser {
        LeaderboardUser {
            rank,
            user_id: entry.user_id_str(),
            username: entry.username.clone(),
            name: entry.name.clone(),
            image: entry.image.clone(),
            primary_value: entry.total_portfolio_value_f64(),
            secondary_value: entry.base_currency_balance_f64(),
            label: label.to_string(),
            reputation_score: None,
        }
    };

    let mut top_rugpullers: Vec<LeaderboardUser> = lb.top_rugpullers.iter().enumerate()
        .map(|(i, e)| map_rugpuller(e, i as u32 + 1)).collect();
    let mut biggest_losers: Vec<LeaderboardUser> = lb.biggest_losers.iter().enumerate()
        .map(|(i, e)| map_loser(e, i as u32 + 1)).collect();
    let mut cash_kings: Vec<LeaderboardUser> = lb.cash_kings.iter().enumerate()
        .map(|(i, e)| map_wealth(e, i as u32 + 1, "portfolio")).collect();
    let mut paper_millionaires: Vec<LeaderboardUser> = lb.paper_millionaires.iter().enumerate()
        .map(|(i, e)| map_wealth(e, i as u32 + 1, "portfolio")).collect();

    // Attach reputation scores
    if let Some(pool) = pool {
        for list in [&mut top_rugpullers, &mut biggest_losers, &mut cash_kings, &mut paper_millionaires] {
            for user in list.iter_mut() {
                if let Ok(Some(rep)) = sqlite::get_reputation(pool, &user.user_id).await {
                    user.reputation_score = Some(rep.score);
                }
            }
        }
    }

    Ok(LeaderboardFullResponse {
        top_rugpullers,
        biggest_losers,
        cash_kings,
        paper_millionaires,
    })
}

#[tauri::command]
pub async fn report_rug_pull(
    app_handle: tauri::AppHandle,
    user_id: String,
    username: String,
) -> Result<(), String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::record_rug_pull(db.pool(), &user_id, &username)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_user_reputation(
    app_handle: tauri::AppHandle,
    user_id: String,
) -> Result<Option<ReputationInfo>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let rep = sqlite::get_reputation(db.pool(), &user_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rep.map(|r| ReputationInfo {
        score: r.score,
        rug_pulls: r.rug_pulls,
        leaderboard_appearances: r.leaderboard_appearances,
        total_extracted: r.total_extracted,
        last_updated: r.last_updated,
    }))
}

#[tauri::command]
pub async fn search_users_reputation(
    app_handle: tauri::AppHandle,
    query: String,
) -> Result<Vec<ReputationInfo>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let results = sqlite::search_reputation(db.pool(), &query)
        .await
        .map_err(|e| e.to_string())?;

    Ok(results.into_iter().map(|r| ReputationInfo {
        score: r.score,
        rug_pulls: r.rug_pulls,
        leaderboard_appearances: r.leaderboard_appearances,
        total_extracted: r.total_extracted,
        last_updated: r.last_updated,
    }).collect())
}
