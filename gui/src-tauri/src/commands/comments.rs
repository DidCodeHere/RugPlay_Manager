//! Coin comment commands

use crate::AppState;
use rugplay_core::CoinComment;
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::Serialize;
use tauri::State;
use tracing::{debug, error};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentResponse {
    pub id: i64,
    pub content: String,
    pub user_id: i64,
    pub user_username: String,
    pub user_name: Option<String>,
    pub user_image: Option<String>,
    pub likes_count: i32,
    pub is_liked_by_user: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

impl From<CoinComment> for CommentResponse {
    fn from(c: CoinComment) -> Self {
        Self {
            id: c.id,
            content: c.content,
            user_id: c.user_id,
            user_username: c.user_username,
            user_name: c.user_name,
            user_image: c.user_image,
            likes_count: c.likes_count,
            is_liked_by_user: c.is_liked_by_user,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }
    }
}

#[tauri::command]
pub async fn get_coin_comments(
    symbol: String,
    state: State<'_, AppState>,
) -> Result<Vec<CommentResponse>, String> {
    debug!("Fetching comments for {}", symbol);

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(
            &sqlite::get_profile_token(db.pool(), active_profile.id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Profile token not found")?,
        )
        .map_err(|e| e.to_string())?;

    let client = RugplayClient::new(&token);
    let resp = client.get_coin_comments(&symbol).await.map_err(|e| {
        error!("Failed to fetch comments for {}: {}", symbol, e);
        e.to_string()
    })?;

    debug!("Got {} comments for {}", resp.comments.len(), symbol);
    Ok(resp.comments.into_iter().map(CommentResponse::from).collect())
}

#[tauri::command]
pub async fn post_coin_comment(
    symbol: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<CommentResponse, String> {
    debug!("Posting comment on {}", symbol);

    if content.trim().is_empty() {
        return Err("Comment cannot be empty".to_string());
    }
    if content.len() > 500 {
        return Err("Comment must be 500 characters or less".to_string());
    }

    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(
            &sqlite::get_profile_token(db.pool(), active_profile.id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Profile token not found")?,
        )
        .map_err(|e| e.to_string())?;

    let client = RugplayClient::new(&token);
    let comment = client
        .post_coin_comment(&symbol, content.trim())
        .await
        .map_err(|e| {
            error!("Failed to post comment on {}: {}", symbol, e);
            e.to_string()
        })?;

    debug!("Posted comment #{} on {}", comment.id, symbol);
    Ok(CommentResponse::from(comment))
}
