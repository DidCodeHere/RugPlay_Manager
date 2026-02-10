//! Database connection and initialization

use rugplay_core::{Error, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

/// Database wrapper for SQLite operations
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Connect to database at the given path, creating if necessary
    pub async fn connect(path: &Path) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;
        }

        let path_str = path.to_string_lossy();
        let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path_str))
            .map_err(|e| Error::DatabaseError(e.to_string()))?
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    /// Connect to in-memory database (for testing)
    pub async fn connect_in_memory() -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    /// Run database migrations
    async fn run_migrations(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                user_id TEXT,
                token_encrypted BLOB NOT NULL,
                iv BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_verified TIMESTAMP,
                is_active INTEGER DEFAULT 0,
                UNIQUE(username)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS coins (
                symbol TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon_url TEXT,
                creator_id TEXT,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                trade_type TEXT NOT NULL,
                coin_amount REAL NOT NULL,
                price REAL NOT NULL,
                usd_value REAL NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id)
            );

            CREATE TABLE IF NOT EXISTS holdings (
                profile_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                avg_entry_price REAL NOT NULL,
                PRIMARY KEY (profile_id, symbol),
                FOREIGN KEY (profile_id) REFERENCES profiles(id)
            );

            CREATE TABLE IF NOT EXISTS whales (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                performance_score REAL DEFAULT 0.0,
                tracked_since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sentinels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                stop_loss_pct REAL,
                take_profit_pct REAL,
                trailing_stop_pct REAL,
                sell_percentage REAL DEFAULT 100.0,
                entry_price REAL NOT NULL,
                highest_price_seen REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                has_custom_settings INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                triggered_at TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id)
            );

            CREATE TABLE IF NOT EXISTS snipe_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                coin_name TEXT NOT NULL,
                buy_amount_usd REAL NOT NULL,
                market_cap REAL NOT NULL,
                price REAL NOT NULL,
                coin_age_secs INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id)
            );

            CREATE TABLE IF NOT EXISTS automation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                module TEXT NOT NULL,
                symbol TEXT NOT NULL,
                coin_name TEXT NOT NULL,
                action TEXT NOT NULL,
                amount_usd REAL NOT NULL,
                details TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id)
            );

            CREATE TABLE IF NOT EXISTS reputation (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                score REAL DEFAULT 50.0,
                rug_pulls INTEGER DEFAULT 0,
                leaderboard_appearances INTEGER DEFAULT 0,
                total_extracted REAL DEFAULT 0.0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT DEFAULT ''
            );
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // ── Migrations for existing databases ──────────────────────────
        // Add has_custom_settings column to sentinels (idempotent)
        let _ = sqlx::query(
            "ALTER TABLE sentinels ADD COLUMN has_custom_settings INTEGER DEFAULT 0"
        )
        .execute(&self.pool)
        .await;

        // Deduplicate sentinels: keep only the newest per (profile_id, symbol)
        let deduped = crate::sqlite::deduplicate_sentinels(&self.pool).await.unwrap_or(0);
        if deduped > 0 {
            eprintln!("[persistence] Migration: removed {} duplicate sentinels", deduped);
        }

        // Create unique index so duplicates can't recur (idempotent)
        let _ = sqlx::query(
            r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_sentinels_profile_symbol_active
               ON sentinels (profile_id, symbol)
               WHERE triggered_at IS NULL"#
        )
        .execute(&self.pool)
        .await;

        Ok(())
    }

    /// Get a reference to the connection pool
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
