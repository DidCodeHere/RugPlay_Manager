//! Sniper Strategy - Auto-buy new coins
//! 
//! TODO: Implement in Phase 2

/// Configuration for the sniper strategy
#[derive(Debug, Clone)]
pub struct SniperConfig {
    /// Whether the sniper is enabled
    pub enabled: bool,
    /// USD amount to invest per new coin
    pub invest_amount: f64,
    /// Minimum liquidity required
    pub min_liquidity: f64,
    /// Daily investment limit
    pub daily_limit: f64,
    /// Blacklisted creator IDs
    pub blacklisted_creators: Vec<String>,
}

impl Default for SniperConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            invest_amount: 10.0,
            min_liquidity: 1000.0,
            daily_limit: 100.0,
            blacklisted_creators: Vec::new(),
        }
    }
}

/// Sniper strategy for auto-buying new coins
pub struct SniperStrategy {
    config: SniperConfig,
}

impl SniperStrategy {
    pub fn new(config: SniperConfig) -> Self {
        Self { config }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
    }
}
