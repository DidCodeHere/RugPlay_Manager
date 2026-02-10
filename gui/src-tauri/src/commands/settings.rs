//! Tauri commands for persisting app-wide settings
//!
//! Migrates sentinel defaults + blacklisted coins from localStorage
//! to the SQLite settings table in the backend.

use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx;
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

/// Storage stats returned to the frontend
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_dir: String,
    pub db_size_bytes: u64,
    pub profile_count: i64,
    pub transaction_count: i64,
    pub sentinel_count: i64,
    pub automation_log_count: i64,
}

/// Get the local data directory path plus DB size
#[tauri::command]
pub async fn get_storage_info(
    state: State<'_, AppState>,
) -> Result<StorageInfo, String> {
    let data_dir = state.data_dir.to_string_lossy().to_string();

    let db_path = state.data_dir.join("rugplay.db");
    let db_size_bytes = std::fs::metadata(&db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let db_guard = state.db.read().await;
    let (profile_count, transaction_count, sentinel_count, automation_log_count) =
        if let Some(db) = db_guard.as_ref() {
            let profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
                .fetch_one(db.pool()).await.unwrap_or(0);
            let txns: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transactions")
                .fetch_one(db.pool()).await.unwrap_or(0);
            let sentinels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sentinels")
                .fetch_one(db.pool()).await.unwrap_or(0);
            let logs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM automation_log")
                .fetch_one(db.pool()).await.unwrap_or(0);
            (profiles, txns, sentinels, logs)
        } else {
            (0, 0, 0, 0)
        };

    Ok(StorageInfo {
        data_dir,
        db_size_bytes,
        profile_count,
        transaction_count,
        sentinel_count,
        automation_log_count,
    })
}

/// Clear old automation log entries (keeps last N)
#[tauri::command]
pub async fn clear_automation_logs(
    state: State<'_, AppState>,
    keep_last: Option<i64>,
) -> Result<u64, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    let keep = keep_last.unwrap_or(0);

    let result = if keep > 0 {
        sqlx::query(
            "DELETE FROM automation_log WHERE id NOT IN \
             (SELECT id FROM automation_log ORDER BY created_at DESC LIMIT ?)"
        )
        .bind(keep)
        .execute(db.pool())
        .await
    } else {
        sqlx::query("DELETE FROM automation_log")
            .execute(db.pool())
            .await
    };

    result.map(|r| r.rows_affected()).map_err(|e| e.to_string())
}

/// Clear all triggered (historical) sentinels
#[tauri::command]
pub async fn clear_triggered_sentinels(
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlx::query("DELETE FROM sentinels WHERE triggered_at IS NOT NULL")
        .execute(db.pool())
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| e.to_string())
}

/// Clear all transaction history
#[tauri::command]
pub async fn clear_transaction_history(
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlx::query("DELETE FROM transactions")
        .execute(db.pool())
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| e.to_string())
}

/// Run VACUUM to compact the database file
#[tauri::command]
pub async fn vacuum_database(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlx::query("VACUUM")
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
