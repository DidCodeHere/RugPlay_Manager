//! Tauri commands for the Harvester module

use crate::harvester::HarvesterHandle;
use serde::Serialize;
use tauri::{Manager, State};

/// Harvester status response sent to the frontend
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvesterStatusResponse {
    pub enabled: bool,
    pub last_claim_at: Option<String>,
    pub next_claim_at: Option<String>,
    pub seconds_until_next: i64,
    pub total_claims: u32,
}

#[tauri::command]
pub async fn get_harvester_status(
    app_handle: tauri::AppHandle,
    _handle: State<'_, HarvesterHandle>,
) -> Result<HarvesterStatusResponse, String> {
    // Harvester is always enabled
    let enabled = true;

    // Read per-profile timestamps from DB and find the soonest
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    let pool = db.pool();

    // Load all per-profile last_claim values
    let rows: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value FROM settings WHERE key LIKE 'harvester_profile_%_last_claim'"
    )
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let claim_interval = 12 * 60 * 60i64;

    let mut min_seconds_until_next: i64 = i64::MAX;
    let mut latest_claim_epoch: i64 = 0;
    let mut total_claims: u32 = 0;

    if !rows.is_empty() {

        for (_key, value) in &rows {
            let last_claim: i64 = value.parse().unwrap_or(0);
            if last_claim > latest_claim_epoch {
                latest_claim_epoch = last_claim;
            }
            let secs = (claim_interval - (now - last_claim)).max(0);
            if secs < min_seconds_until_next {
                min_seconds_until_next = secs;
            }
        }
        if min_seconds_until_next == i64::MAX {
            min_seconds_until_next = 0;
        }

        // Load total claims across all profiles
        let claim_rows: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
            "SELECT key, value FROM settings WHERE key LIKE 'harvester_profile_%_total_claims'"
        )
        .fetch_all(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

        for (_, value) in &claim_rows {
            total_claims += value.parse::<u32>().unwrap_or(0);
        }
    } else {
        // Fallback: read legacy global state
        latest_claim_epoch = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'harvester_last_claim'"
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?
        .and_then(|v: String| v.parse().ok())
        .unwrap_or(0);

        total_claims = sqlx::query_scalar::<sqlx::Sqlite, String>(
            "SELECT value FROM settings WHERE key = 'harvester_total_claims'"
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?
        .and_then(|v: String| v.parse().ok())
        .unwrap_or(0);

        min_seconds_until_next = if latest_claim_epoch > 0 {
            (claim_interval - (now - latest_claim_epoch)).max(0)
        } else {
            0
        };
    }

    let last_claim_at = if latest_claim_epoch > 0 {
        chrono::DateTime::from_timestamp(latest_claim_epoch, 0)
            .map(|dt| dt.to_rfc3339())
    } else {
        None
    };

    let next_claim_at = if latest_claim_epoch > 0 {
        chrono::DateTime::from_timestamp(latest_claim_epoch + claim_interval, 0)
            .map(|dt| dt.to_rfc3339())
    } else {
        Some("Now".to_string())
    };

    Ok(HarvesterStatusResponse {
        enabled,
        last_claim_at,
        next_claim_at,
        seconds_until_next: min_seconds_until_next,
        total_claims,
    })
}

#[tauri::command]
pub async fn set_harvester_enabled(
    _app_handle: tauri::AppHandle,
    _handle: State<'_, HarvesterHandle>,
    _enabled: bool,
) -> Result<bool, String> {
    // Harvester is always on — accept the call but always return true
    Ok(true)
}

#[tauri::command]
pub async fn force_claim_reward(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // Force-claim for ALL profiles, not just the active one
    let state = app_handle.state::<crate::AppState>();

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let profiles = rugplay_persistence::sqlite::list_profiles(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    if profiles.is_empty() {
        return Err("No profiles saved".to_string());
    }

    drop(db_guard);

    let mut results: Vec<String> = Vec::new();
    let mut any_success = false;

    for profile in &profiles {
        // Decrypt token
        let token = match decrypt_token(&app_handle, profile.id).await {
            Ok(t) => t,
            Err(e) => {
                results.push(format!("{}: token error — {}", profile.username, e));
                continue;
            }
        };

        let client = rugplay_networking::RugplayClient::new_with_cache(
            &token,
            state.coin_cache.clone(),
        );

        // Check if eligible first
        match client.get_reward_status().await {
            Ok(status) => {
                if !status.can_claim {
                    // time_remaining from API is in MILLISECONDS
                    let remaining_secs = status.time_remaining / 1000;
                    let h = remaining_secs / 3600;
                    let m = (remaining_secs % 3600) / 60;
                    results.push(format!("{}: not ready ({}h {}m left)", profile.username, h, m));
                    continue;
                }
            }
            Err(e) => {
                results.push(format!("{}: status check failed — {}", profile.username, e));
                continue;
            }
        }

        // Claim
        match client.claim_daily_reward().await {
            Ok(claim_response) => {
                any_success = true;

                // Update per-profile DB state
                let now = chrono::Utc::now().timestamp();
                save_claim_to_db(&app_handle, profile.id, now).await;

                results.push(format!(
                    "{}: ${:.2} claimed (streak: {})",
                    profile.username,
                    claim_response.reward_amount,
                    claim_response.login_streak
                ));
            }
            Err(e) => {
                results.push(format!("{}: claim failed — {}", profile.username, e));
            }
        }
    }

    if any_success {
        Ok(results.join("\n"))
    } else {
        Err(results.join("\n"))
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

async fn decrypt_token(app_handle: &tauri::AppHandle, profile_id: i64) -> Result<String, String> {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let encrypted = rugplay_persistence::sqlite::get_profile_token(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Token not found")?;

    state
        .encryptor
        .decrypt(&encrypted)
        .map_err(|e| e.to_string())
}

async fn save_claim_to_db(app_handle: &tauri::AppHandle, profile_id: i64, now: i64) {
    let state = app_handle.state::<crate::AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };
    let pool = db.pool();

    let key_prefix = format!("harvester_profile_{}", profile_id);

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2"
    )
    .bind(format!("{}_last_claim", key_prefix))
    .bind(now.to_string())
    .execute(pool)
    .await;

    // Increment total claims
    let total: u32 = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = ?1"
    )
    .bind(format!("{}_total_claims", key_prefix))
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .and_then(|v: String| v.parse().ok())
    .unwrap_or(0) + 1;

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2"
    )
    .bind(format!("{}_total_claims", key_prefix))
    .bind(total.to_string())
    .execute(pool)
    .await;
}
