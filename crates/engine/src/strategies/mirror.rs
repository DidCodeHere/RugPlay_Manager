//! Mirror Strategy - Copy whale trades
//! 
//! TODO: Implement in Phase 2

/// Configuration for whale tracking
#[derive(Debug, Clone)]
pub struct MirrorConfig {
    /// Whether mirror trading is enabled
    pub enabled: bool,
    /// Percentage of whale trade size to copy (e.g., 0.05 = 5%)
    pub scale_factor: f64,
    /// Maximum latency in seconds before skipping a trade
    pub max_latency_secs: f64,
    /// List of whale user IDs to track
    pub tracked_whales: Vec<String>,
}

impl Default for MirrorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            scale_factor: 0.05,
            max_latency_secs: 2.0,
            tracked_whales: Vec::new(),
        }
    }
}

/// Mirror strategy for copying whale trades
pub struct MirrorStrategy {
    config: MirrorConfig,
}

impl MirrorStrategy {
    pub fn new(config: MirrorConfig) -> Self {
        Self { config }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn add_whale(&mut self, user_id: String) {
        if !self.config.tracked_whales.contains(&user_id) {
            self.config.tracked_whales.push(user_id);
        }
    }

    pub fn remove_whale(&mut self, user_id: &str) {
        self.config.tracked_whales.retain(|id| id != user_id);
    }
}
