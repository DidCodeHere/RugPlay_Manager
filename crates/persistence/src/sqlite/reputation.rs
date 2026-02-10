//! Reputation score queries

use sqlx::SqlitePool;

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct ReputationRecord {
    pub user_id: String,
    pub username: String,
    pub score: f64,
    pub rug_pulls: i64,
    pub leaderboard_appearances: i64,
    pub total_extracted: f64,
    pub last_updated: Option<String>,
    pub notes: String,
}

pub async fn get_reputation(pool: &SqlitePool, user_id: &str) -> Result<Option<ReputationRecord>, sqlx::Error> {
    sqlx::query_as::<_, ReputationRecord>(
        "SELECT user_id, username, score, rug_pulls, leaderboard_appearances, total_extracted, last_updated, notes FROM reputation WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_reputation(
    pool: &SqlitePool,
    user_id: &str,
    username: &str,
    score: f64,
    rug_pulls: i64,
    leaderboard_appearances: i64,
    total_extracted: f64,
    notes: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO reputation (user_id, username, score, rug_pulls, leaderboard_appearances, total_extracted, last_updated, notes)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             username = excluded.username,
             score = excluded.score,
             rug_pulls = excluded.rug_pulls,
             leaderboard_appearances = excluded.leaderboard_appearances,
             total_extracted = excluded.total_extracted,
             last_updated = excluded.last_updated,
             notes = excluded.notes"#,
    )
    .bind(user_id)
    .bind(username)
    .bind(score)
    .bind(rug_pulls)
    .bind(leaderboard_appearances)
    .bind(total_extracted)
    .bind(notes)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_reputation_score(
    pool: &SqlitePool,
    user_id: &str,
    score_delta: f64,
    reason: &str,
) -> Result<(), sqlx::Error> {
    // Clamp score between 0 and 100
    sqlx::query(
        r#"UPDATE reputation
           SET score = MAX(0.0, MIN(100.0, score + ?)),
               notes = notes || CHAR(10) || ?,
               last_updated = CURRENT_TIMESTAMP
           WHERE user_id = ?"#,
    )
    .bind(score_delta)
    .bind(reason)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn record_rug_pull(
    pool: &SqlitePool,
    user_id: &str,
    username: &str,
) -> Result<(), sqlx::Error> {
    // Insert if missing, then increment rug_pulls and lower score
    sqlx::query(
        r#"INSERT INTO reputation (user_id, username, score, rug_pulls, last_updated, notes)
           VALUES (?, ?, 50.0, 0, CURRENT_TIMESTAMP, '')
           ON CONFLICT(user_id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(username)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"UPDATE reputation
           SET rug_pulls = rug_pulls + 1,
               score = MAX(0.0, score - 15.0),
               last_updated = CURRENT_TIMESTAMP,
               notes = notes || CHAR(10) || 'Rug pull detected'
           WHERE user_id = ?"#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn record_leaderboard_rugpuller(
    pool: &SqlitePool,
    user_id: &str,
    username: &str,
    total_extracted: f64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO reputation (user_id, username, score, rug_pulls, leaderboard_appearances, total_extracted, last_updated, notes)
           VALUES (?, ?, 35.0, 0, 1, ?, CURRENT_TIMESTAMP, 'Appeared on rugpuller leaderboard')
           ON CONFLICT(user_id) DO UPDATE SET
             username = excluded.username,
             leaderboard_appearances = leaderboard_appearances + 1,
             total_extracted = ?,
             score = MAX(0.0, MIN(100.0, score - 5.0)),
             last_updated = CURRENT_TIMESTAMP,
             notes = notes || CHAR(10) || 'Appeared on rugpuller leaderboard'"#,
    )
    .bind(user_id)
    .bind(username)
    .bind(total_extracted)
    .bind(total_extracted)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn search_reputation(
    pool: &SqlitePool,
    query: &str,
) -> Result<Vec<ReputationRecord>, sqlx::Error> {
    sqlx::query_as::<_, ReputationRecord>(
        "SELECT user_id, username, score, rug_pulls, leaderboard_appearances, total_extracted, last_updated, notes FROM reputation WHERE username LIKE ? ORDER BY score ASC LIMIT 50",
    )
    .bind(format!("%{}%", query))
    .fetch_all(pool)
    .await
}
