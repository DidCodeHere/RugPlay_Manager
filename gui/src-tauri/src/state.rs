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
