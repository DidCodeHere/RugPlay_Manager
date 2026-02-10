//! Tauri commands for the Sniper module

use crate::sniper::{self, SniperConfig, SniperHandle};
use serde::Serialize;
use tauri::{Manager, State};

/// Sniper status response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SniperStatusResponse {
    pub enabled: bool,
    pub config: SniperConfig,
    pub total_sniped: u32,
    pub last_sniped_at: Option<String>,
}

#[tauri::command]
pub async fn get_sniper_status(
    app_handle: tauri::AppHandle,
    handle: State<'_, SniperHandle>,
) -> Result<SniperStatusResponse, String> {
    let enabled = handle.is_enabled();
    let config = handle.get_config().await;

    // Read stats from DB
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;

    let (total_sniped, last_sniped_at) = if let Some(db) = db_guard.as_ref() {
        let pool = db.pool();

        let total: u32 = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'sniper_total_sniped'"
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?
        .and_then(|v: String| v.parse().ok())
        .unwrap_or(0);

        let last: Option<String> = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'sniper_last_sniped_at'"
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

        (total, last)
    } else {
        (0, None)
    };

    Ok(SniperStatusResponse {
        enabled,
        config,
        total_sniped,
        last_sniped_at,
    })
}

#[tauri::command]
pub async fn set_sniper_enabled(
    app_handle: tauri::AppHandle,
    handle: State<'_, SniperHandle>,
    enabled: bool,
) -> Result<bool, String> {
    if enabled {
        handle.enable();
    } else {
        handle.disable();
    }

    sniper::save_sniper_enabled(&app_handle, enabled).await;
    Ok(enabled)
}

#[tauri::command]
pub async fn update_sniper_config(
    app_handle: tauri::AppHandle,
    handle: State<'_, SniperHandle>,
    config: SniperConfig,
) -> Result<SniperConfig, String> {
    handle.set_config(config.clone()).await;
    sniper::save_sniper_config(&app_handle, &config).await;
    Ok(config)
}

#[tauri::command]
pub async fn clear_sniped_symbols_cmd(
    app_handle: tauri::AppHandle,
) -> Result<u32, String> {
    let count = sniper::clear_sniped_symbols(&app_handle).await;
    Ok(count)
}

#[tauri::command]
pub async fn clear_coin_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<crate::AppState>();
    state.coin_cache.clear();
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipeLogEntry {
    pub symbol: String,
    pub coin_name: String,
    pub buy_amount_usd: f64,
    pub market_cap: f64,
    pub price: f64,
    pub coin_age_secs: i64,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn get_snipe_history(
    app_handle: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<SnipeLogEntry>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active = rugplay_persistence::sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let cap = limit.unwrap_or(50).min(100) as i64;

    let rows = sqlx::query_as::<_, (String, String, f64, f64, f64, i64, Option<String>)>(
        "SELECT symbol, coin_name, buy_amount_usd, market_cap, price, coin_age_secs, created_at \
         FROM snipe_log WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(active.id)
    .bind(cap)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(symbol, coin_name, buy_amount_usd, market_cap, price, coin_age_secs, created_at)| {
        SnipeLogEntry { symbol, coin_name, buy_amount_usd, market_cap, price, coin_age_secs, created_at }
    }).collect())
}
