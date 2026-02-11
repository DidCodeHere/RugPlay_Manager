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

/// Create a new sentinel (raw insert, no duplicate check).
/// Prefer `upsert_sentinel` for most use cases.
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
    .bind(entry_price)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.last_insert_rowid())
}

/// Create or update a sentinel for a coin. If an active, non-triggered sentinel
/// already exists for this profile+symbol, update its entry price instead of
/// creating a duplicate. Returns the sentinel ID.
pub async fn upsert_sentinel(
    pool: &SqlitePool,
    profile_id: i64,
    symbol: &str,
    stop_loss_pct: Option<f64>,
    take_profit_pct: Option<f64>,
    trailing_stop_pct: Option<f64>,
    sell_percentage: f64,
    entry_price: f64,
) -> Result<i64> {
    let existing = sqlx::query_as::<_, SentinelRow>(
        r#"
        SELECT id, profile_id, symbol, stop_loss_pct, take_profit_pct,
               trailing_stop_pct, sell_percentage, entry_price,
               highest_price_seen, is_active, created_at, triggered_at
        FROM sentinels
        WHERE profile_id = ? AND symbol = ? AND triggered_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(profile_id)
    .bind(symbol)
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    match existing {
        Some(row) => {
            let new_highest = f64::max(row.highest_price_seen, entry_price);
            sqlx::query(
                r#"
                UPDATE sentinels
                SET entry_price = ?, highest_price_seen = ?, is_active = 1,
                    stop_loss_pct = ?, take_profit_pct = ?, trailing_stop_pct = ?,
                    sell_percentage = ?
                WHERE id = ?
                "#,
            )
            .bind(entry_price)
            .bind(new_highest)
            .bind(stop_loss_pct)
            .bind(take_profit_pct)
            .bind(trailing_stop_pct)
            .bind(sell_percentage)
            .bind(row.id)
            .execute(pool)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;
            Ok(row.id)
        }
        None => {
            create_sentinel(
                pool, profile_id, symbol,
                stop_loss_pct, take_profit_pct, trailing_stop_pct,
                sell_percentage, entry_price,
            ).await
        }
    }
}

/// Deduplicate sentinels: for each (profile_id, symbol) keep only the newest
/// non-triggered sentinel and delete the rest. Safe for old user data.
pub async fn deduplicate_sentinels(pool: &SqlitePool) -> Result<u64> {
    let result = sqlx::query(
        r#"
        DELETE FROM sentinels
        WHERE id NOT IN (
            SELECT MAX(id) FROM sentinels
            WHERE triggered_at IS NULL
            GROUP BY profile_id, symbol
        )
        AND triggered_at IS NULL
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
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

/// Re-arm a sentinel after a partial sell.
/// Resets entry_price and highest_price_seen to the current price so the
/// sentinel can trigger again for the remaining holdings.
pub async fn rearm_sentinel(
    pool: &SqlitePool,
    sentinel_id: i64,
    new_entry_price: f64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sentinels
        SET entry_price = ?, highest_price_seen = ?, triggered_at = NULL, is_active = 1
        WHERE id = ?
        "#,
    )
    .bind(new_entry_price)
    .bind(new_entry_price)
    .bind(sentinel_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
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

/// Delete non-triggered sentinels for coins no longer in the held set.
/// Preserves triggered sentinels for history/audit purposes.
pub async fn cleanup_stale_sentinels(
    pool: &SqlitePool,
    profile_id: i64,
    held_symbols: &[String],
) -> Result<u64> {
    if held_symbols.is_empty() {
        let result = sqlx::query(
            "DELETE FROM sentinels WHERE profile_id = ? AND triggered_at IS NULL"
        )
        .bind(profile_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;
        return Ok(result.rows_affected());
    }

    let placeholders: Vec<String> = held_symbols.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "DELETE FROM sentinels WHERE profile_id = ? AND symbol NOT IN ({}) AND triggered_at IS NULL",
        placeholders.join(", ")
    );

    let mut query = sqlx::query(&query_str).bind(profile_id);
    for sym in held_symbols {
        query = query.bind(sym);
    }

    let result = query.execute(pool).await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}

/// Reactivate a sentinel that was prematurely marked triggered (e.g. sell failed).
pub async fn reactivate_sentinel(
    pool: &SqlitePool,
    sentinel_id: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sentinels
        SET is_active = 1, triggered_at = NULL
        WHERE id = ?
        "#,
    )
    .bind(sentinel_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Update only the entry price of a sentinel to stay in sync with the
/// portfolio's weighted average purchase price after additional buys.
/// Does NOT touch SL/TP/trailing/sell% or has_custom_settings.
pub async fn sync_entry_price(
    pool: &SqlitePool,
    sentinel_id: i64,
    avg_entry_price: f64,
) -> Result<()> {
    sqlx::query(
        "UPDATE sentinels SET entry_price = ? WHERE id = ?",
    )
    .bind(avg_entry_price)
    .bind(sentinel_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Delete old triggered sentinels for coins no longer held.
/// Unlike `cleanup_stale_sentinels` (which preserves triggered rows), this
/// removes triggered rows whose symbol is NOT in the current portfolio.
pub async fn cleanup_triggered_sentinels(
    pool: &SqlitePool,
    profile_id: i64,
    held_symbols: &[String],
) -> Result<u64> {
    if held_symbols.is_empty() {
        let result = sqlx::query(
            "DELETE FROM sentinels WHERE profile_id = ? AND triggered_at IS NOT NULL"
        )
        .bind(profile_id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;
        return Ok(result.rows_affected());
    }

    let placeholders: Vec<String> = held_symbols.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "DELETE FROM sentinels WHERE profile_id = ? AND symbol NOT IN ({}) AND triggered_at IS NOT NULL",
        placeholders.join(", ")
    );

    let mut query = sqlx::query(&query_str).bind(profile_id);
    for sym in held_symbols {
        query = query.bind(sym);
    }

    let result = query.execute(pool).await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}

/// Delete duplicate triggered sentinels: for each (profile_id, symbol),
/// keep only the newest triggered row and delete older ones.
pub async fn cleanup_duplicate_triggered(
    pool: &SqlitePool,
    profile_id: i64,
) -> Result<u64> {
    let result = sqlx::query(
        r#"
        DELETE FROM sentinels
        WHERE profile_id = ?
          AND triggered_at IS NOT NULL
          AND id NOT IN (
              SELECT MAX(id) FROM sentinels
              WHERE profile_id = ? AND triggered_at IS NOT NULL
              GROUP BY symbol
          )
        "#,
    )
    .bind(profile_id)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}

/// Deactivate and delete non-triggered sentinels for blacklisted coins.
/// Returns the number of sentinels removed.
pub async fn remove_blacklisted_sentinels(
    pool: &SqlitePool,
    profile_id: i64,
    blacklisted_symbols: &[String],
) -> Result<u64> {
    if blacklisted_symbols.is_empty() {
        return Ok(0);
    }

    let placeholders: Vec<String> = blacklisted_symbols.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "DELETE FROM sentinels WHERE profile_id = ? AND symbol IN ({}) AND triggered_at IS NULL",
        placeholders.join(", ")
    );

    let mut query = sqlx::query(&query_str).bind(profile_id);
    for sym in blacklisted_symbols {
        query = query.bind(sym);
    }

    let result = query.execute(pool).await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.rows_affected())
}
