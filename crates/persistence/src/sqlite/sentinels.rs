//! Sentinel persistence operations

use rugplay_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Sentinel configuration stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SentinelRow {
    pub id: i64,
    pub profile_id: i64,
    pub symbol: String,
    pub stop_loss_pct: Option<f64>,
    pub take_profit_pct: Option<f64>,
    pub trailing_stop_pct: Option<f64>,
    pub sell_percentage: f64,
    pub entry_price: f64,
    pub highest_price_seen: f64,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub triggered_at: Option<String>,
}

/// Create a new sentinel
pub async fn create_sentinel(
    pool: &SqlitePool,
    profile_id: i64,
    symbol: &str,
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
    entry_price: f64,
) -> Result<i64> {
    let result = sqlx::query(
        r#"
        INSERT INTO sentinels (profile_id, symbol, stop_loss_pct, take_profit_pct, 
                               trailing_stop_pct, sell_percentage, entry_price, 
                               highest_price_seen, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(profile_id)
    .bind(symbol)
    .bind(stop_loss_pct)
    .bind(take_profit_pct)
    .bind(trailing_stop_pct)
    .bind(sell_percentage)
    .bind(entry_price)
    .bind(entry_price) // highest_price_seen starts at entry_price
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.last_insert_rowid())
}

/// Get all sentinels for a profile
pub async fn get_sentinels(pool: &SqlitePool, profile_id: i64) -> Result<Vec<SentinelRow>> {
    let rows = sqlx::query_as::<_, SentinelRow>(
        r#"
        SELECT id, profile_id, symbol, stop_loss_pct, take_profit_pct, 
               trailing_stop_pct, sell_percentage, entry_price, 
               highest_price_seen, is_active, created_at, triggered_at
        FROM sentinels
        WHERE profile_id = ?
        ORDER BY created_at DESC
        "#,
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(rows)
}

/// Get all active sentinels across all profiles
pub async fn get_active_sentinels(pool: &SqlitePool) -> Result<Vec<SentinelRow>> {
    let rows = sqlx::query_as::<_, SentinelRow>(
        r#"
        SELECT id, profile_id, symbol, stop_loss_pct, take_profit_pct, 
               trailing_stop_pct, sell_percentage, entry_price, 
               highest_price_seen, is_active, created_at, triggered_at
        FROM sentinels
        WHERE is_active = 1
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(rows)
}

/// Update sentinel's highest price seen (for trailing stop)
pub async fn update_highest_price(
    pool: &SqlitePool,
    sentinel_id: i64,
    highest_price: f64,
) -> Result<()> {
    sqlx::query("UPDATE sentinels SET highest_price_seen = ? WHERE id = ?")
        .bind(highest_price)
        .bind(sentinel_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Mark sentinel as triggered (deactivate and record trigger time)
pub async fn mark_sentinel_triggered(pool: &SqlitePool, sentinel_id: i64) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sentinels 
        SET is_active = 0, triggered_at = CURRENT_TIMESTAMP 
        WHERE id = ?
        "#,
    )
    .bind(sentinel_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Toggle sentinel active status
pub async fn set_sentinel_active(
    pool: &SqlitePool,
    sentinel_id: i64,
    is_active: bool,
) -> Result<()> {
    sqlx::query("UPDATE sentinels SET is_active = ? WHERE id = ?")
        .bind(is_active)
        .bind(sentinel_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Delete a sentinel
pub async fn delete_sentinel(pool: &SqlitePool, sentinel_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM sentinels WHERE id = ?")
        .bind(sentinel_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Get a specific sentinel by ID
pub async fn get_sentinel_by_id(pool: &SqlitePool, sentinel_id: i64) -> Result<Option<SentinelRow>> {
    let row = sqlx::query_as::<_, SentinelRow>(
        r#"
        SELECT id, profile_id, symbol, stop_loss_pct, take_profit_pct, 
               trailing_stop_pct, sell_percentage, entry_price, 
               highest_price_seen, is_active, created_at, triggered_at
        FROM sentinels
        WHERE id = ?
        "#,
    )
    .bind(sentinel_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(row)
}

/// Delete all sentinels for a given symbol and profile
pub async fn delete_sentinels_by_symbol(pool: &SqlitePool, profile_id: i64, symbol: &str) -> Result<u64> {
    let result = sqlx::query("DELETE FROM sentinels WHERE profile_id = ? AND symbol = ?")
        .bind(profile_id)
        .bind(symbol)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}

/// Update sentinel configuration (and mark as having custom settings)
pub async fn update_sentinel(
    pool: &SqlitePool,
    sentinel_id: i64,
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sentinels 
        SET stop_loss_pct = ?, take_profit_pct = ?, trailing_stop_pct = ?, sell_percentage = ?,
            has_custom_settings = 1
        WHERE id = ?
        "#,
    )
    .bind(stop_loss_pct)
    .bind(take_profit_pct)
    .bind(trailing_stop_pct)
    .bind(sell_percentage)
    .bind(sentinel_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Update ALL sentinels for a profile with new settings (batch update)
/// Skips sentinels that have been individually customized (has_custom_settings = 1)
pub async fn update_all_sentinels(
    pool: &SqlitePool,
    profile_id: i64,
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
) -> Result<u64> {
    let result = sqlx::query(
        r#"
        UPDATE sentinels 
        SET stop_loss_pct = ?, take_profit_pct = ?, trailing_stop_pct = ?, sell_percentage = ?
        WHERE profile_id = ? AND triggered_at IS NULL AND has_custom_settings = 0
        "#,
    )
    .bind(stop_loss_pct)
    .bind(take_profit_pct)
    .bind(trailing_stop_pct)
    .bind(sell_percentage)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}

/// Toggle active status for ALL sentinels of a profile
pub async fn set_all_sentinels_active(
    pool: &SqlitePool,
    profile_id: i64,
    is_active: bool,
) -> Result<u64> {
    let result = sqlx::query(
        r#"
        UPDATE sentinels 
        SET is_active = ?
        WHERE profile_id = ? AND triggered_at IS NULL
        "#,
    )
    .bind(is_active)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}
