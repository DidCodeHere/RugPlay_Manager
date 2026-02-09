//! In-memory caching layer for frequently accessed data

use rugplay_core::CoinDetails;
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Cached item with expiration
struct CacheEntry<T> {
    value: T,
    inserted_at: Instant,
    ttl: Duration,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > self.ttl
    }
}

/// Thread-safe cache for coin data with TTL and max-entry bounds
pub struct CoinCache {
    coins: RwLock<HashMap<String, CacheEntry<CoinDetails>>>,
    default_ttl: Duration,
    max_entries: usize,
}

impl CoinCache {
    /// Create a new cache with default TTL and max entry count
    pub fn with_capacity(default_ttl: Duration, max_entries: usize) -> Self {
        Self {
            coins: RwLock::new(HashMap::new()),
            default_ttl,
            max_entries,
        }
    }

    /// Create a new cache with default TTL (unbounded — prefer `with_capacity`)
    pub fn new(default_ttl: Duration) -> Self {
        Self::with_capacity(default_ttl, 500)
    }

    /// Get a coin from cache if not expired
    pub fn get(&self, symbol: &str) -> Option<CoinDetails> {
        let cache = self.coins.read().ok()?;
        let entry = cache.get(symbol)?;
        
        if entry.is_expired() {
            None
        } else {
            Some(entry.value.clone())
        }
    }

    /// Insert or update a coin in cache.
    /// Evicts expired entries if at capacity.
    pub fn insert(&self, coin: CoinDetails) {
        if let Ok(mut cache) = self.coins.write() {
            // Evict expired entries if at capacity
            if cache.len() >= self.max_entries {
                cache.retain(|_, entry| !entry.is_expired());
            }

            // If still at capacity after cleanup, evict oldest
            if cache.len() >= self.max_entries {
                if let Some(oldest_key) = cache
                    .iter()
                    .min_by_key(|(_, e)| e.inserted_at)
                    .map(|(k, _)| k.clone())
                {
                    cache.remove(&oldest_key);
                }
            }

            let symbol = coin.symbol.clone();
            cache.insert(
                symbol,
                CacheEntry {
                    value: coin,
                    inserted_at: Instant::now(),
                    ttl: self.default_ttl,
                },
            );
        }
    }

    /// Insert with a custom TTL (e.g., longer TTL for metadata-only)
    pub fn insert_with_ttl(&self, coin: CoinDetails, ttl: Duration) {
        if let Ok(mut cache) = self.coins.write() {
            if cache.len() >= self.max_entries {
                cache.retain(|_, entry| !entry.is_expired());
            }

            let symbol = coin.symbol.clone();
            cache.insert(
                symbol,
                CacheEntry {
                    value: coin,
                    inserted_at: Instant::now(),
                    ttl,
                },
            );
        }
    }

    /// Remove a coin from cache (e.g., after a trade changes its price)
    pub fn invalidate(&self, symbol: &str) {
        if let Ok(mut cache) = self.coins.write() {
            cache.remove(symbol);
        }
    }

    /// Remove a coin from cache (alias for invalidate)
    pub fn remove(&self, symbol: &str) {
        self.invalidate(symbol);
    }

    /// Clear all expired entries
    pub fn cleanup(&self) {
        if let Ok(mut cache) = self.coins.write() {
            cache.retain(|_, entry| !entry.is_expired());
        }
    }

    /// Clear entire cache
    pub fn clear(&self) {
        if let Ok(mut cache) = self.coins.write() {
            cache.clear();
        }
    }

    /// Get current cache size
    pub fn len(&self) -> usize {
        self.coins.read().map(|c| c.len()).unwrap_or(0)
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Default for CoinCache {
    fn default() -> Self {
        // Default 30 second TTL for coin data, max 500 entries
        Self::with_capacity(Duration::from_secs(30), 500)
    }
}
