//! Tauri commands for the Dip Buyer module

use crate::dipbuyer::{self, Aggressiveness, DipBuyerConfig, DipBuyerHandle};
use serde::Serialize;
use tauri::{Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerStatusResponse {
    pub enabled: bool,
    pub config: DipBuyerConfig,
    pub total_bought: u32,
    pub last_bought_at: Option<String>,
}

#[tauri::command]
pub async fn get_dipbuyer_status(
    app_handle: tauri::AppHandle,
    handle: State<'_, DipBuyerHandle>,
) -> Result<DipBuyerStatusResponse, String> {
    let enabled = handle.is_enabled();
    let config = handle.get_config().await;

    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;

    let (total_bought, last_bought_at) = if let Some(db) = db_guard.as_ref() {
        let pool = db.pool();

        let total: u32 = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'dipbuyer_total_bought'",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?
        .and_then(|v: String| v.parse().ok())
        .unwrap_or(0);

        let last: Option<String> = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'dipbuyer_last_bought_at'",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

        (total, last)
    } else {
        (0, None)
    };

    Ok(DipBuyerStatusResponse {
        enabled,
        config,
        total_bought,
        last_bought_at,
    })
}

#[tauri::command]
pub async fn set_dipbuyer_enabled(
    app_handle: tauri::AppHandle,
    handle: State<'_, DipBuyerHandle>,
    enabled: bool,
) -> Result<bool, String> {
    if enabled {
        handle.enable();
    } else {
        handle.disable();
    }

    dipbuyer::save_dipbuyer_enabled(&app_handle, enabled).await;
    Ok(enabled)
}

#[tauri::command]
pub async fn update_dipbuyer_config(
    app_handle: tauri::AppHandle,
    handle: State<'_, DipBuyerHandle>,
    config: DipBuyerConfig,
) -> Result<DipBuyerConfig, String> {
    handle.set_config(config.clone()).await;
    dipbuyer::save_dipbuyer_config(&app_handle, &config).await;
    Ok(config)
}

#[tauri::command]
pub async fn get_dipbuyer_preset(
    preset: Aggressiveness,
) -> Result<DipBuyerConfig, String> {
    Ok(preset.to_preset())
}

/// Reset the entire DipBuyer config to research-backed defaults for the given preset.
/// Clears persisted config from the DB and applies a fresh preset, preserving only the blacklist.
#[tauri::command]
pub async fn reset_dipbuyer_config(
    app_handle: tauri::AppHandle,
    handle: State<'_, DipBuyerHandle>,
    preset: Option<Aggressiveness>,
) -> Result<DipBuyerConfig, String> {
    let current = handle.get_config().await;
    let level = preset.unwrap_or(current.preset.clone());

    let mut fresh = level.to_preset();
    // Preserve existing blacklisted coins across reset
    fresh.blacklisted_coins = current.blacklisted_coins.clone();

    handle.set_config(fresh.clone()).await;
    dipbuyer::save_dipbuyer_config(&app_handle, &fresh).await;

    Ok(fresh)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerLogEntry {
    pub id: i64,
    pub symbol: String,
    pub coin_name: String,
    pub action: String,
    pub amount_usd: f64,
    pub details: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn get_dipbuyer_history(
    app_handle: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<DipBuyerLogEntry>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active = rugplay_persistence::sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let cap = limit.unwrap_or(50).min(100) as i64;

    let rows = sqlx::query_as::<_, (i64, String, String, String, f64, String, Option<String>)>(
        "SELECT id, symbol, coin_name, action, amount_usd, details, created_at \
         FROM automation_log WHERE profile_id = ? AND module = 'dipbuyer' \
         ORDER BY created_at DESC LIMIT ?",
    )
    .bind(active.id)
    .bind(cap)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, symbol, coin_name, action, amount_usd, details, created_at)| {
        DipBuyerLogEntry { id, symbol, coin_name, action, amount_usd, details, created_at }
    }).collect())
}

/// Get all automation log entries across all modules
#[tauri::command]
pub async fn get_automation_log(
    app_handle: tauri::AppHandle,
    module: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<AutomationLogEntry>, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active = rugplay_persistence::sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let cap = limit.unwrap_or(100).min(500) as i64;

    let entries = if let Some(ref mod_filter) = module {
        sqlx::query_as::<_, (i64, String, String, String, String, f64, String, Option<String>)>(
            "SELECT id, module, symbol, coin_name, action, amount_usd, details, created_at \
             FROM automation_log WHERE profile_id = ? AND module = ? \
             ORDER BY created_at DESC LIMIT ?",
        )
        .bind(active.id)
        .bind(mod_filter)
        .bind(cap)
        .fetch_all(db.pool())
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as::<_, (i64, String, String, String, String, f64, String, Option<String>)>(
            "SELECT id, module, symbol, coin_name, action, amount_usd, details, created_at \
             FROM automation_log WHERE profile_id = ? \
             ORDER BY created_at DESC LIMIT ?",
        )
        .bind(active.id)
        .bind(cap)
        .fetch_all(db.pool())
        .await
        .map_err(|e| e.to_string())?
    };

    Ok(entries.into_iter().map(|(id, module, symbol, coin_name, action, amount_usd, details, created_at)| {
        AutomationLogEntry { id, module, symbol, coin_name, action, amount_usd, details, created_at }
    }).collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLogEntry {
    pub id: i64,
    pub module: String,
    pub symbol: String,
    pub coin_name: String,
    pub action: String,
    pub amount_usd: f64,
    pub details: String,
    pub created_at: Option<String>,
}
