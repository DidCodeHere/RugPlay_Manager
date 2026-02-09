//! Authentication commands for Tauri

use crate::AppState;
use rugplay_core::{ProfileSummary, UserProfile};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{error, info};

/// Result of attempting to log in to a profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum LoginResult {
    #[serde(rename = "success")]
    Success { profile: UserProfile },
    #[serde(rename = "expired")]
    TokenExpired { profile_id: i64 },
    #[serde(rename = "error")]
    Error { message: String },
}

/// List all saved profiles
#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<ProfileSummary>, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let profiles = sqlite::list_profiles(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(profiles.into_iter().map(ProfileSummary::from).collect())
}

/// Add a new profile with session token
/// 
/// Validates the token with Rugplay API and fetches the username
#[tauri::command]
pub async fn add_profile(
    token: String,
    state: State<'_, AppState>,
) -> Result<ProfileSummary, String> {
    info!("Adding new profile");

    // Validate token with API
    let client = RugplayClient::new(&token);
    let user_profile = client.verify_auth().await.map_err(|e| {
        error!("Token validation failed: {}", e);
        format!("Invalid token: {}", e)
    })?;

    info!("Token valid for user: {}", user_profile.username);

    // Check if profile already exists
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    if sqlite::profile_exists(db.pool(), &user_profile.username)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err(format!(
            "Profile for '{}' already exists",
            user_profile.username
        ));
    }

    // Encrypt token
    let encrypted = state
        .encryptor
        .encrypt(&token)
        .map_err(|e| e.to_string())?;

    // Save to database
    let profile_id = sqlite::create_profile(
        db.pool(),
        &user_profile.username,
        Some(&user_profile.id),
        &encrypted,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Update last verified
    sqlite::update_last_verified(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?;

    info!("Profile created with ID: {}", profile_id);

    Ok(ProfileSummary {
        id: profile_id,
        username: user_profile.username,
        last_verified: Some(chrono::Utc::now().to_rfc3339()),
    })
}

/// Select and log in to a profile
/// 
/// Validates the saved token. Returns TokenExpired if invalid.
#[tauri::command]
pub async fn select_profile(
    profile_id: i64,
    state: State<'_, AppState>,
) -> Result<LoginResult, String> {
    info!("Selecting profile: {}", profile_id);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    // Get the encrypted token
    let encrypted = sqlite::get_profile_token(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Profile not found".to_string())?;

    // Decrypt token
    let token = state
        .encryptor
        .decrypt(&encrypted)
        .map_err(|e| e.to_string())?;

    // Validate with API
    let client = RugplayClient::new(&token);
    match client.verify_auth().await {
        Ok(user_profile) => {
            // Token is valid - set as active profile
            sqlite::set_active_profile(db.pool(), profile_id)
                .await
                .map_err(|e| e.to_string())?;

            sqlite::update_last_verified(db.pool(), profile_id)
                .await
                .map_err(|e| e.to_string())?;

            info!("Logged in as: {}", user_profile.username);

            Ok(LoginResult::Success {
                profile: user_profile,
            })
        }
        Err(rugplay_core::Error::TokenExpired) => {
            info!("Token expired for profile: {}", profile_id);
            Ok(LoginResult::TokenExpired { profile_id })
        }
        Err(e) => {
            error!("Login failed: {}", e);
            Ok(LoginResult::Error {
                message: e.to_string(),
            })
        }
    }
}

/// Update token for an existing profile
#[tauri::command]
pub async fn update_profile_token(
    profile_id: i64,
    new_token: String,
    state: State<'_, AppState>,
) -> Result<ProfileSummary, String> {
    info!("Updating token for profile: {}", profile_id);

    // Validate new token
    let client = RugplayClient::new(&new_token);
    let user_profile = client.verify_auth().await.map_err(|e| {
        error!("New token validation failed: {}", e);
        format!("Invalid token: {}", e)
    })?;

    // Encrypt new token
    let encrypted = state
        .encryptor
        .encrypt(&new_token)
        .map_err(|e| e.to_string())?;

    // Update in database
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    sqlite::update_profile_token(db.pool(), profile_id, &encrypted)
        .await
        .map_err(|e| e.to_string())?;

    sqlite::update_last_verified(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?;

    info!("Token updated for profile: {}", profile_id);

    Ok(ProfileSummary {
        id: profile_id,
        username: user_profile.username,
        last_verified: Some(chrono::Utc::now().to_rfc3339()),
    })
}

/// Delete a profile
#[tauri::command]
pub async fn delete_profile(
    profile_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("Deleting profile: {}", profile_id);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    sqlite::delete_profile(db.pool(), profile_id)
        .await
        .map_err(|e| e.to_string())?;

    info!("Profile deleted: {}", profile_id);
    Ok(())
}

/// Logout (deactivate current profile)
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    info!("Logging out");

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Deactivate all profiles
    sqlx::query("UPDATE profiles SET is_active = 0")
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the currently active profile (if any)
#[tauri::command]
pub async fn get_active_profile(
    state: State<'_, AppState>,
) -> Result<Option<ProfileSummary>, String> {
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(profile.map(ProfileSummary::from))
}
