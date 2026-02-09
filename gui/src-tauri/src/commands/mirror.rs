//! Tauri commands for the Mirror module

use crate::mirror::{self, MirrorConfig, MirrorHandle, MirrorTradeRecord};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::Serialize;
use tauri::{Manager, State};

/// Mirror status response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorStatusResponse {
    pub enabled: bool,
    pub config: MirrorConfig,
    pub tracked_whale_count: u32,
    pub total_mirrored: u32,
    pub last_mirrored_at: Option<String>,
}

/// Whale profile summary for the frontend
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhaleProfileResponse {
    pub user_id: String,
    pub username: String,
    pub name: String,
    pub image: Option<String>,
    pub balance: f64,
    pub holdings_count: u32,
    pub total_volume: f64,
    pub portfolio_value: f64,
}

/// Tracked whale info for the frontend
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedWhaleResponse {
    pub user_id: String,
    pub username: String,
    pub performance_score: f64,
    pub tracked_since: String,
}

#[tauri::command]
pub async fn get_mirror_status(
    app_handle: tauri::AppHandle,
    handle: State<'_, MirrorHandle>,
) -> Result<MirrorStatusResponse, String> {
    let enabled = handle.is_enabled();
    let config = handle.get_config().await;
    let whale_ids = handle.get_tracked_whale_ids().await;

    // Read stats from DB
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;

    let (total_mirrored, last_mirrored_at) = if let Some(db) = db_guard.as_ref() {
        let pool = db.pool();

        let total: u32 = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'mirror_total_mirrored'",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

        let last: Option<String> = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'mirror_last_mirrored_at'",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        (total, last)
    } else {
        (0, None)
    };

    Ok(MirrorStatusResponse {
        enabled,
        config,
        tracked_whale_count: whale_ids.len() as u32,
        total_mirrored,
        last_mirrored_at,
    })
}

#[tauri::command]
pub async fn set_mirror_enabled(
    app_handle: tauri::AppHandle,
    handle: State<'_, MirrorHandle>,
    enabled: bool,
) -> Result<bool, String> {
    if enabled {
        handle.enable();
    } else {
        handle.disable();
    }

    mirror::save_mirror_enabled(&app_handle, enabled).await;
    Ok(enabled)
}

#[tauri::command]
pub async fn update_mirror_config(
    app_handle: tauri::AppHandle,
    handle: State<'_, MirrorHandle>,
    config: MirrorConfig,
) -> Result<MirrorConfig, String> {
    handle.set_config(config.clone()).await;
    mirror::save_mirror_config(&app_handle, &config).await;
    Ok(config)
}

#[tauri::command]
pub async fn add_tracked_whale(
    app_handle: tauri::AppHandle,
    handle: State<'_, MirrorHandle>,
    user_id: String,
    username: String,
) -> Result<(), String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    // Add to DB
    sqlite::add_whale(db.pool(), &user_id, &username)
        .await
        .map_err(|e| e.to_string())?;

    // Add to in-memory tracking
    handle.add_whale(user_id).await;

    Ok(())
}

#[tauri::command]
pub async fn remove_tracked_whale(
    app_handle: tauri::AppHandle,
    handle: State<'_, MirrorHandle>,
    user_id: String,
) -> Result<(), String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    // Remove from DB
    sqlite::remove_whale(db.pool(), &user_id)
        .await
        .map_err(|e| e.to_string())?;

    // Remove from in-memory tracking
    handle.remove_whale(&user_id).await;

    Ok(())
}

#[tauri::command]
pub async fn list_tracked_whales(
    app_handle: tauri::AppHandle,
) -> Result<Vec<TrackedWhaleResponse>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let whales = sqlite::list_whales(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(whales
        .into_iter()
        .map(|w| TrackedWhaleResponse {
            user_id: w.user_id,
            username: w.username,
            performance_score: w.performance_score,
            tracked_since: w.tracked_since,
        })
        .collect())
}

#[tauri::command]
pub async fn get_whale_profile(
    app_handle: tauri::AppHandle,
    user_id: String,
) -> Result<WhaleProfileResponse, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    let pool = db.pool();

    // Get active profile token to make API call
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

    let client = RugplayClient::new(&token);

    // Fetch public profile
    let profile = client
        .get_user_profile(&user_id)
        .await
        .map_err(|e| format!("Failed to fetch profile: {}", e))?;

    // Parse user_id from the response (may be number or string)
    let uid = match &profile.profile.id {
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    };

    Ok(WhaleProfileResponse {
        user_id: uid,
        username: profile.profile.username,
        name: profile.profile.name,
        image: profile.profile.image,
        balance: profile.stats.balance(),
        holdings_count: profile.stats.holdings_count_u32(),
        total_volume: profile.stats.total_volume(),
        portfolio_value: profile.stats.total_portfolio_value_f64(),
    })
}

#[tauri::command]
pub async fn get_mirror_trades(
    handle: State<'_, MirrorHandle>,
) -> Result<Vec<MirrorTradeRecord>, String> {
    Ok(handle.get_trade_history().await)
}
