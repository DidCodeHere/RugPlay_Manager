//! Transaction persistence operations

use rugplay_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Transaction record stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TransactionRow {
    pub id: i64,
    pub profile_id: i64,
    pub symbol: String,
    pub trade_type: String,
    pub coin_amount: f64,
    pub price: f64,
    pub usd_value: f64,
    pub timestamp: Option<String>,
}

/// Log a new transaction
pub async fn log_transaction(
    pool: &SqlitePool,
    profile_id: i64,
    symbol: &str,
    trade_type: &str,
    coin_amount: f64,
    price: f64,
    usd_value: f64,
) -> Result<i64> {
    let result = sqlx::query(
        r#"
        INSERT INTO transactions (profile_id, symbol, trade_type, coin_amount, price, usd_value)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(profile_id)
    .bind(symbol)
    .bind(trade_type)
    .bind(coin_amount)
    .bind(price)
    .bind(usd_value)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.last_insert_rowid())
}

/// Get transactions for a profile with optional filters
pub async fn get_transactions(
    pool: &SqlitePool,
    profile_id: i64,
    limit: u32,
    offset: u32,
    trade_type: Option<&str>,
    symbol: Option<&str>,
) -> Result<Vec<TransactionRow>> {
    let mut query = String::from(
        r#"
        SELECT id, profile_id, symbol, trade_type, coin_amount, price, usd_value, timestamp
        FROM transactions
        WHERE profile_id = ?
        "#
    );

    if trade_type.is_some() {
        query.push_str(" AND trade_type = ?");
    }
    if symbol.is_some() {
        query.push_str(" AND symbol = ?");
    }

    query.push_str(" ORDER BY timestamp DESC LIMIT ? OFFSET ?");

    let mut builder = sqlx::query_as::<_, TransactionRow>(&query)
        .bind(profile_id);

    if let Some(tt) = trade_type {
        builder = builder.bind(tt);
    }
    if let Some(sym) = symbol {
        builder = builder.bind(sym);
    }

    let rows = builder
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(rows)
}

/// Get transaction count for a profile
pub async fn count_transactions(
    pool: &SqlitePool,
    profile_id: i64,
) -> Result<u32> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM transactions WHERE profile_id = ?"
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(row.0 as u32)
}

/// Get all unique symbols traded by a profile
pub async fn get_traded_symbols(
    pool: &SqlitePool,
    profile_id: i64,
) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT symbol FROM transactions WHERE profile_id = ? ORDER BY symbol"
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(rows.into_iter().map(|r| r.0).collect())
}
