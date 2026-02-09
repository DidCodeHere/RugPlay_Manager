//! Harvester — Background auto-claim loop for ALL profiles
//!
//! Periodically checks if each saved profile is eligible for the daily reward
//! and claims it automatically. Uses the server-side `GET /api/rewards/claim`
//! endpoint to check eligibility before attempting a claim, providing robust
//! handling of cooldowns, 429s, and server-side timing.
//!
//! The harvester runs for all profiles and can be disabled by the user.

use crate::AppState;
use crate::notifications::NotificationHandle;
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

/// How often to check / emit countdown (60 seconds)
const CHECK_INTERVAL_SECS: u64 = 60;

/// Back-off after a failed claim attempt (seconds)
const RETRY_BACKOFF_SECS: i64 = 300; // 5 minutes

// ─── Events ──────────────────────────────────────────────────────────

/// Emitted when a claim is successfully made
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvesterClaimedEvent {
    pub profile_id: i64,
    pub username: String,
    pub reward_amount: f64,
    pub new_balance: f64,
    pub login_streak: u32,
    pub next_claim_at: Option<String>,
    pub total_claims: u32,
}

/// Emitted every tick with countdown info (shortest countdown across all profiles)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvesterTickEvent {
    pub enabled: bool,
    pub seconds_until_next: i64,
    pub last_claim_at: Option<String>,
    pub total_claims: u32,
    pub profiles_count: u32,
}

/// Per-profile claim state tracked in memory
#[derive(Debug, Clone)]
struct ProfileClaimState {
    /// Server-reported seconds until next eligible claim (or our best guess)
    next_eligible_epoch: i64,
    /// Total successful claims for this profile
    total_claims: u32,
    /// Last successful claim timestamp
    last_claim_epoch: i64,
    /// Whether we're currently in a back-off due to error
    backoff_until: i64,
}

// ─── Handle ──────────────────────────────────────────────────────────

/// Handle to control the harvester from Tauri commands
#[derive(Clone)]
pub struct HarvesterHandle {
    cancel: CancellationToken,
    enabled_tx: Arc<tokio::sync::watch::Sender<bool>>,
}

impl HarvesterHandle {
    /// Check if harvester is enabled
    pub fn is_enabled(&self) -> bool {
        *self.enabled_tx.borrow()
    }

    /// Enable the harvester
    pub fn enable(&self) {
        let _ = self.enabled_tx.send(true);
        info!("Harvester enabled");
    }

    /// Disable the harvester (stops claiming but task stays alive)
    pub fn disable(&self) {
        let _ = self.enabled_tx.send(false);
        info!("Harvester disabled by user");
    }

    /// Stop the harvester task entirely
    pub fn stop(&self) {
        self.cancel.cancel();
        info!("Harvester stopped");
    }
}

// ─── Spawn ───────────────────────────────────────────────────────────

/// Spawn the harvester background task.
/// Returns a handle for controlling it.
pub fn spawn_harvester(app_handle: tauri::AppHandle) -> HarvesterHandle {
    let cancel = CancellationToken::new();
    let (enabled_tx, enabled_rx) = tokio::sync::watch::channel(true); // enabled by default

    let handle = HarvesterHandle {
        cancel: cancel.clone(),
        enabled_tx: Arc::new(enabled_tx),
    };

    // Restore enabled state from DB
    let restore_app = app_handle.clone();
    let restore_handle = handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
        let saved = load_harvester_enabled_state(&restore_app).await;
        if !saved {
            restore_handle.disable();
            info!("Harvester: restored disabled state from DB");
        }
    });

    tokio::spawn(harvester_loop(app_handle, cancel, enabled_rx));

    handle
}

// ─── Loop ────────────────────────────────────────────────────────────

async fn harvester_loop(
    app_handle: tauri::AppHandle,
    cancel: CancellationToken,
    enabled_rx: tokio::sync::watch::Receiver<bool>,
) {
    info!("Harvester loop started (multi-profile)");

    // Give the app a moment to initialize DB
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    // Per-profile tracking: profile_id -> claim state
    let mut profile_states: HashMap<i64, ProfileClaimState> = HashMap::new();

    // Load saved state from DB
    load_all_profile_states(&app_handle, &mut profile_states).await;

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(CHECK_INTERVAL_SECS));

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("Harvester cancelled, exiting");
                return;
            }
            _ = interval.tick() => {
                let now = chrono::Utc::now().timestamp();

                // Check if harvester is enabled
                if !*enabled_rx.borrow() {
                    emit_disabled_tick(&app_handle);
                    continue;
                }

                // Get all profiles from DB
                let profiles = match get_all_profiles(&app_handle).await {
                    Ok(p) => p,
                    Err(e) => {
                        debug!("Harvester: can't load profiles: {}", e);
                        emit_idle_tick(&app_handle);
                        continue;
                    }
                };

                if profiles.is_empty() {
                    emit_idle_tick(&app_handle);
                    continue;
                }

                // Process each profile
                for profile in &profiles {
                    let state = profile_states
                        .entry(profile.id)
                        .or_insert_with(|| ProfileClaimState {
                            next_eligible_epoch: 0,
                            total_claims: 0,
                            last_claim_epoch: 0,
                            backoff_until: 0,
                        });

                    // Skip if in backoff
                    if now < state.backoff_until {
                        debug!(
                            "Harvester: profile {} ({}) in backoff for {}s more",
                            profile.id, profile.username,
                            state.backoff_until - now
                        );
                        continue;
                    }

                    // Skip if we know it's not time yet (with 30s tolerance)
                    let secs_until = (state.next_eligible_epoch - now).max(0);
                    if secs_until > 30 {
                        continue;
                    }

                    // This profile might be eligible — decrypt token and check server
                    let token = match decrypt_profile_token(&app_handle, profile.id).await {
                        Ok(t) => t,
                        Err(e) => {
                            debug!("Harvester: can't decrypt token for profile {} ({}): {}", profile.id, profile.username, e);
                            state.backoff_until = now + RETRY_BACKOFF_SECS;
                            continue;
                        }
                    };

                    let client = RugplayClient::new_with_cache(&token, {
                        let app_state = app_handle.state::<AppState>();
                        app_state.coin_cache.clone()
                    });

                    // Step 1: Check eligibility with GET /api/rewards/claim
                    let reward_status = match client.get_reward_status().await {
                        Ok(s) => s,
                        Err(e) => {
                            warn!("Harvester: reward status check failed for profile {} ({}): {}", profile.id, profile.username, e);
                            state.backoff_until = now + RETRY_BACKOFF_SECS;
                            continue;
                        }
                    };

                    // Update our tracking from server data
                    // NOTE: time_remaining from API is in MILLISECONDS, convert to seconds
                    let remaining_secs = reward_status.time_remaining / 1000;
                    if !reward_status.can_claim {
                        state.next_eligible_epoch = now + remaining_secs;
                        debug!(
                            "Harvester: profile {} ({}) not ready, {}s remaining",
                            profile.id, profile.username, remaining_secs
                        );
                        continue;
                    }

                    // Step 2: Server says we can claim!
                    info!(
                        "Harvester: claiming reward for profile {} ({}) — ${:.2}",
                        profile.id, profile.username, reward_status.reward_amount
                    );

                    match client.claim_daily_reward().await {
                        Ok(claim_response) => {
                            state.last_claim_epoch = now;
                            state.total_claims += 1;

                            // Parse next_claim_time from server response
                            if let Some(ref nct) = claim_response.next_claim_time {
                                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(nct) {
                                    state.next_eligible_epoch = dt.timestamp();
                                } else {
                                    warn!("Harvester: couldn't parse next_claim_time '{}', falling back to now+12h", nct);
                                    state.next_eligible_epoch = now + 12 * 3600;
                                }
                            } else {
                                state.next_eligible_epoch = now + 12 * 3600;
                            }

                            state.backoff_until = 0;

                            // Persist
                            save_profile_claim_state(&app_handle, profile.id, state).await;

                            info!(
                                "Harvester: profile {} ({}) claimed ${:.2} (streak: {}, total: {})",
                                profile.id, profile.username,
                                claim_response.reward_amount,
                                claim_response.login_streak,
                                state.total_claims
                            );

                            // Emit claimed event
                            let event = HarvesterClaimedEvent {
                                profile_id: profile.id,
                                username: profile.username.clone(),
                                reward_amount: claim_response.reward_amount,
                                new_balance: claim_response.new_balance,
                                login_streak: claim_response.login_streak,
                                next_claim_at: claim_response.next_claim_time.clone(),
                                total_claims: state.total_claims,
                            };
                            if let Err(e) = app_handle.emit("harvester-claimed", &event) {
                                warn!("Failed to emit harvester-claimed: {}", e);
                            }

                            // Native notification
                            if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                                notif.notify_harvester_claimed(
                                    claim_response.reward_amount,
                                    &profile.username,
                                    claim_response.login_streak,
                                ).await;
                            }
                        }
                        Err(e) => {
                            let err_str = e.to_string();
                            error!("Harvester: claim failed for profile {} ({}): {}", profile.id, profile.username, err_str);
                            // Back off — could be 429 rate limit or other server error
                            state.backoff_until = now + RETRY_BACKOFF_SECS;
                        }
                    }
                }

                // Calculate aggregate tick data
                let mut min_seconds_until_next: i64 = i64::MAX;
                let mut total_claims_all: u32 = 0;
                let mut last_claim_epoch_any: i64 = 0;

                for state in profile_states.values() {
                    total_claims_all += state.total_claims;
                    if state.last_claim_epoch > last_claim_epoch_any {
                        last_claim_epoch_any = state.last_claim_epoch;
                    }
                    let secs = (state.next_eligible_epoch - now).max(0);
                    if secs < min_seconds_until_next {
                        min_seconds_until_next = secs;
                    }
                }
                if min_seconds_until_next == i64::MAX {
                    min_seconds_until_next = 0;
                }

                // Emit tick with aggregate data
                let tick = HarvesterTickEvent {
                    enabled: *enabled_rx.borrow(),
                    seconds_until_next: min_seconds_until_next,
                    last_claim_at: if last_claim_epoch_any > 0 {
                        chrono::DateTime::from_timestamp(last_claim_epoch_any, 0)
                            .map(|dt| dt.to_rfc3339())
                    } else {
                        None
                    },
                    total_claims: total_claims_all,
                    profiles_count: profiles.len() as u32,
                };

                if let Err(e) = app_handle.emit("harvester-tick", &tick) {
                    warn!("Failed to emit harvester-tick: {}", e);
                }
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

fn emit_idle_tick(app_handle: &tauri::AppHandle) {
    let tick = HarvesterTickEvent {
        enabled: true,
        seconds_until_next: 0,
        last_claim_at: None,
        total_claims: 0,
        profiles_count: 0,
    };
    let _ = app_handle.emit("harvester-tick", &tick);
}

/// Get all profiles from the database
async fn get_all_profiles(app_handle: &tauri::AppHandle) -> Result<Vec<rugplay_core::Profile>, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    sqlite::list_profiles(db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Decrypt a profile's token
async fn decrypt_profile_token(app_handle: &tauri::AppHandle, profile_id: i64) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let encrypted = sqlite::get_profile_token(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Profile token not found")?;

    state
        .encryptor
        .decrypt(&encrypted)
        .map_err(|e| e.to_string())
}

/// Load per-profile claim states from the settings table
async fn load_all_profile_states(
    app_handle: &tauri::AppHandle,
    states: &mut HashMap<i64, ProfileClaimState>,
) {
    let app_state = app_handle.state::<AppState>();
    let db_guard = app_state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    // Load all harvester_profile_* keys
    let rows: Vec<(String, String)> = match sqlx::query_as::<_, (String, String)>(
        "SELECT key, value FROM settings WHERE key LIKE 'harvester_profile_%'"
    )
    .fetch_all(db.pool())
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to load harvester profile states: {}", e);
            return;
        }
    };

    for (key, value) in rows {
        // Keys are like: harvester_profile_42_last_claim, harvester_profile_42_total_claims
        let rest = match key.strip_prefix("harvester_profile_") {
            Some(r) => r,
            None => continue,
        };
        let (id_str, field) = match rest.find('_') {
            Some(pos) => (&rest[..pos], &rest[pos + 1..]),
            None => continue,
        };
        let profile_id: i64 = match id_str.parse() {
            Ok(id) => id,
            Err(_) => continue,
        };

        let state = states
            .entry(profile_id)
            .or_insert_with(|| ProfileClaimState {
                next_eligible_epoch: 0,
                total_claims: 0,
                last_claim_epoch: 0,
                backoff_until: 0,
            });

        match field {
            "last_claim" => {
                state.last_claim_epoch = value.parse().unwrap_or(0);
                if state.last_claim_epoch > 0 {
                    state.next_eligible_epoch = state.last_claim_epoch + 12 * 3600;
                }
            }
            "total_claims" => {
                state.total_claims = value.parse().unwrap_or(0);
            }
            _ => {}
        }
    }

    // Migrate old global state if present (one-time migration)
    let last_claim: i64 = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'harvester_last_claim'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0);

    let total_claims: u32 = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'harvester_total_claims'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0);

    if last_claim > 0 {
        let profiles = match sqlite::list_profiles(db.pool()).await {
            Ok(p) => p,
            Err(_) => return,
        };
        for profile in &profiles {
            if !states.contains_key(&profile.id) {
                states.insert(profile.id, ProfileClaimState {
                    next_eligible_epoch: last_claim + 12 * 3600,
                    total_claims,
                    last_claim_epoch: last_claim,
                    backoff_until: 0,
                });
            }
        }
    }
}

/// Save per-profile claim state to DB
async fn save_profile_claim_state(
    app_handle: &tauri::AppHandle,
    profile_id: i64,
    state: &ProfileClaimState,
) {
    let app_state = app_handle.state::<AppState>();
    let db_guard = app_state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };
    let pool = db.pool();

    let key_prefix = format!("harvester_profile_{}", profile_id);

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2"
    )
    .bind(format!("{}_last_claim", key_prefix))
    .bind(state.last_claim_epoch.to_string())
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2"
    )
    .bind(format!("{}_total_claims", key_prefix))
    .bind(state.total_claims.to_string())
    .execute(pool)
    .await;
}

/// Save whether harvester is enabled
pub async fn save_harvester_enabled(app_handle: &tauri::AppHandle, enabled: bool) {
    let app_state = app_handle.state::<AppState>();
    let db_guard = app_state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('harvester_enabled', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1"
    )
    .bind(if enabled { "true" } else { "false" })
    .execute(db.pool())
    .await;
}

/// Load harvester enabled state from DB
async fn load_harvester_enabled_state(app_handle: &tauri::AppHandle) -> bool {
    let app_state = app_handle.state::<AppState>();
    let db_guard = app_state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return true };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'harvester_enabled'"
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .map(|v| v != "false")
    .unwrap_or(true) // default: enabled
}

fn emit_disabled_tick(app_handle: &tauri::AppHandle) {
    let tick = HarvesterTickEvent {
        enabled: false,
        seconds_until_next: 0,
        last_claim_at: None,
        total_claims: 0,
        profiles_count: 0,
    };
    let _ = app_handle.emit("harvester-tick", &tick);
}
