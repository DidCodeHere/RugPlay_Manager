//! Tauri commands for Risk Limits configuration

use crate::trade_executor::{RiskLimits, TradeExecutorHandle};
use tauri::{Manager, State};

#[tauri::command]
pub async fn get_risk_limits(
    handle: State<'_, TradeExecutorHandle>,
) -> Result<RiskLimits, String> {
    Ok(handle.get_risk_limits().await)
}

#[tauri::command]
pub async fn set_risk_limits(
    app_handle: tauri::AppHandle,
    handle: State<'_, TradeExecutorHandle>,
    limits: RiskLimits,
) -> Result<RiskLimits, String> {
    handle.set_risk_limits(limits.clone()).await;

    // Persist to DB
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    if let Some(db) = db_guard.as_ref() {
        let json = serde_json::to_string(&limits).unwrap_or_default();
        let _ = sqlx::query::<sqlx::Sqlite>(
            "INSERT INTO settings (key, value) VALUES ('risk_limits', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1"
        )
        .bind(&json)
        .execute(db.pool())
        .await;
    }

    Ok(limits)
}

/// Load persisted risk limits from DB (called during startup)
pub async fn load_risk_limits_from_db(app_handle: &tauri::AppHandle) -> Option<RiskLimits> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    let json: String = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'risk_limits'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()?;

    serde_json::from_str(&json).ok()
}
