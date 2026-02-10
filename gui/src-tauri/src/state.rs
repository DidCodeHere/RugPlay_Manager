//! Application state management

use rugplay_persistence::cache::CoinCache;
use rugplay_persistence::{Database, TokenEncryptor};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Global application state shared across Tauri commands
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<RwLock<Option<Database>>>,
    pub encryptor: Arc<TokenEncryptor>,
    pub data_dir: PathBuf,
    /// Shared coin cache for reducing API calls across all modules
    pub coin_cache: Arc<CoinCache>,
}

impl AppState {
    /// Create new application state
    pub fn new(data_dir: PathBuf, encryption_key: &[u8]) -> Result<Self, String> {
        let encryptor = TokenEncryptor::new(encryption_key)
            .map_err(|e| e.to_string())?;

        Ok(Self {
            db: Arc::new(RwLock::new(None)),
            encryptor: Arc::new(encryptor),
            data_dir,
            coin_cache: Arc::new(CoinCache::default()),
        })
    }

    /// Initialize the database connection
    pub async fn init_db(&self) -> Result<(), String> {
        let db_path = self.data_dir.join("rugplay.db");
        let db = Database::connect(&db_path)
            .await
            .map_err(|e| e.to_string())?;
        
        let mut db_lock = self.db.write().await;
        *db_lock = Some(db);
        
        Ok(())
    }
}

/// Write an entry to the centralized automation_log table.
/// Called from sniper, sentinel, mirror, harvester, and dipbuyer loops.
pub async fn save_automation_log(
    app_handle: &tauri::AppHandle,
    module: &str,
    symbol: &str,
    coin_name: &str,
    action: &str,
    amount_usd: f64,
    details: &str,
) {
    use rugplay_persistence::sqlite;
    use tauri::Manager;

    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let profile_id = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p.id,
        _ => return,
    };

    let _ = sqlx::query(
        "INSERT INTO automation_log (profile_id, module, symbol, coin_name, action, amount_usd, details) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(profile_id)
    .bind(module)
    .bind(symbol)
    .bind(coin_name)
    .bind(action)
    .bind(amount_usd)
    .bind(details)
    .execute(db.pool())
    .await;
}
