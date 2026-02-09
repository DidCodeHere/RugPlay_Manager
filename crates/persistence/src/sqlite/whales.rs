//! Whale tracking CRUD operations

use rugplay_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// A tracked whale stored in the database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TrackedWhale {
    pub user_id: String,
    pub username: String,
    pub performance_score: f64,
    pub tracked_since: String,
}

/// Add a whale to the tracking list
pub async fn add_whale(
    pool: &SqlitePool,
    user_id: &str,
    username: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR REPLACE INTO whales (user_id, username) VALUES (?, ?)",
    )
    .bind(user_id)
    .bind(username)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Remove a whale from the tracking list
pub async fn remove_whale(pool: &SqlitePool, user_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM whales WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// List all tracked whales
pub async fn list_whales(pool: &SqlitePool) -> Result<Vec<TrackedWhale>> {
    let whales = sqlx::query_as::<_, TrackedWhale>(
        "SELECT user_id, username, performance_score, tracked_since FROM whales ORDER BY tracked_since DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(whales)
}

/// Get a single tracked whale by user_id
pub async fn get_whale(pool: &SqlitePool, user_id: &str) -> Result<Option<TrackedWhale>> {
    let whale = sqlx::query_as::<_, TrackedWhale>(
        "SELECT user_id, username, performance_score, tracked_since FROM whales WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(whale)
}

/// Update a whale's performance score
pub async fn update_whale_score(
    pool: &SqlitePool,
    user_id: &str,
    score: f64,
) -> Result<()> {
    sqlx::query("UPDATE whales SET performance_score = ? WHERE user_id = ?")
        .bind(score)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Count tracked whales
pub async fn count_whales(pool: &SqlitePool) -> Result<u32> {
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM whales")
            .fetch_one(pool)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(count.0 as u32)
}
