//! Profile CRUD operations

use crate::encryption::EncryptedToken;
use chrono::{DateTime, Utc};
use rugplay_core::{Error, Profile, Result};
use sqlx::SqlitePool;

/// Database row for profile
#[derive(Debug, sqlx::FromRow)]
#[allow(dead_code)]
struct ProfileRow {
    id: i64,
    username: String,
    user_id: Option<String>,
    token_encrypted: Vec<u8>,
    iv: Vec<u8>,
    last_verified: Option<DateTime<Utc>>,
    is_active: i32,
}

impl From<ProfileRow> for Profile {
    fn from(row: ProfileRow) -> Self {
        Profile {
            id: row.id,
            username: row.username,
            user_id: row.user_id,
            last_verified: row.last_verified,
            is_active: row.is_active != 0,
        }
    }
}

/// Create a new profile with encrypted token
pub async fn create_profile(
    pool: &SqlitePool,
    username: &str,
    user_id: Option<&str>,
    encrypted: &EncryptedToken,
) -> Result<i64> {
    let result = sqlx::query(
        r#"
        INSERT INTO profiles (username, user_id, token_encrypted, iv)
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(username)
    .bind(user_id)
    .bind(&encrypted.ciphertext)
    .bind(&encrypted.iv[..])
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(result.last_insert_rowid())
}

/// List all profiles (without decrypted tokens)
pub async fn list_profiles(pool: &SqlitePool) -> Result<Vec<Profile>> {
    let rows: Vec<ProfileRow> = sqlx::query_as(
        r#"
        SELECT id, username, user_id, token_encrypted, iv, last_verified, is_active
        FROM profiles
        ORDER BY last_verified DESC NULLS LAST
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(rows.into_iter().map(Profile::from).collect())
}

/// Get a specific profile by ID
pub async fn get_profile(pool: &SqlitePool, id: i64) -> Result<Option<Profile>> {
    let row: Option<ProfileRow> = sqlx::query_as(
        r#"
        SELECT id, username, user_id, token_encrypted, iv, last_verified, is_active
        FROM profiles
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(row.map(Profile::from))
}

/// Get the currently active profile
pub async fn get_active_profile(pool: &SqlitePool) -> Result<Option<Profile>> {
    let row: Option<ProfileRow> = sqlx::query_as(
        r#"
        SELECT id, username, user_id, token_encrypted, iv, last_verified, is_active
        FROM profiles
        WHERE is_active = 1
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(row.map(Profile::from))
}

/// Get encrypted token for a profile
pub async fn get_profile_token(pool: &SqlitePool, id: i64) -> Result<Option<EncryptedToken>> {
    let row: Option<(Vec<u8>, Vec<u8>)> = sqlx::query_as(
        r#"
        SELECT token_encrypted, iv
        FROM profiles
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    match row {
        Some((ciphertext, iv_vec)) => {
            if iv_vec.len() != 12 {
                return Err(Error::DatabaseError("Invalid IV length".to_string()));
            }
            let mut iv = [0u8; 12];
            iv.copy_from_slice(&iv_vec);
            Ok(Some(EncryptedToken { ciphertext, iv }))
        }
        None => Ok(None),
    }
}

/// Set a profile as the active one (deactivates all others)
pub async fn set_active_profile(pool: &SqlitePool, id: i64) -> Result<()> {
    // Deactivate all profiles
    sqlx::query("UPDATE profiles SET is_active = 0")
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    // Activate the selected profile
    sqlx::query("UPDATE profiles SET is_active = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Update the token for an existing profile
pub async fn update_profile_token(
    pool: &SqlitePool,
    id: i64,
    encrypted: &EncryptedToken,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE profiles
        SET token_encrypted = ?, iv = ?, last_verified = NULL
        WHERE id = ?
        "#,
    )
    .bind(&encrypted.ciphertext)
    .bind(&encrypted.iv[..])
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Update the last_verified timestamp for a profile
pub async fn update_last_verified(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE profiles
        SET last_verified = CURRENT_TIMESTAMP
        WHERE id = ?
        "#,
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Delete a profile
pub async fn delete_profile(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM profiles WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(())
}

/// Check if a profile with the given username exists
pub async fn profile_exists(pool: &SqlitePool, username: &str) -> Result<bool> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles WHERE username = ?")
        .bind(username)
        .fetch_one(pool)
        .await
        .map_err(|e| Error::DatabaseError(e.to_string()))?;

    Ok(count.0 > 0)
}
