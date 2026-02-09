//! Tauri commands for persisting app-wide settings
//!
//! Migrates sentinel defaults + blacklisted coins from localStorage
//! to the SQLite settings table in the backend.

use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Application settings (sentinel defaults + blacklist)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub sentinel_defaults: SentinelDefaults,
    pub auto_manage_sentinels: bool,
    pub blacklisted_coins: Vec<String>,
}

/// Default sentinel parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelDefaults {
    pub stop_loss_pct: f64,
    pub take_profit_pct: f64,
    pub trailing_stop_pct: Option<f64>,
    pub sell_percentage: f64,
}

/// Load app settings from the SQLite settings table
#[tauri::command]
pub async fn get_app_settings(
    state: State<'_, AppState>,
) -> Result<Option<AppSettings>, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let json = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'app_settings'",
    )
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    match json {
        Some(j) => {
            let settings: AppSettings =
                serde_json::from_str(&j).map_err(|e| e.to_string())?;
            Ok(Some(settings))
        }
        None => Ok(None),
    }
}

/// Save app settings to the SQLite settings table
#[tauri::command]
pub async fn set_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;

    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?)")
        .bind(&json)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
