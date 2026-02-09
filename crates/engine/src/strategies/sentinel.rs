//! Sentinel Strategy - Stop Loss / Take Profit / Trailing Stops
//! 
//! Client-side execution of risk management rules

/// Stop loss/take profit configuration for a position
#[derive(Debug, Clone)]
pub struct SentinelConfig {
    /// Stop loss percentage (e.g., -0.10 = -10%)
    pub stop_loss: Option<f64>,
    /// Take profit percentage (e.g., 0.50 = +50%)
    pub take_profit: Option<f64>,
    /// Trailing stop percentage (e.g., 0.10 = 10% below highest)
    pub trailing_stop: Option<f64>,
}

impl Default for SentinelConfig {
    fn default() -> Self {
        Self {
            stop_loss: None,
            take_profit: None,
            trailing_stop: None,
        }
    }
}

/// Tracks a position for stop loss / take profit
#[derive(Debug, Clone)]
pub struct TrackedPosition {
    pub symbol: String,
    pub entry_price: f64,
    pub quantity: f64,
    pub config: SentinelConfig,
    /// Highest price seen since entry (for trailing stop)
    pub highest_price_seen: f64,
}

impl TrackedPosition {
    pub fn new(symbol: String, entry_price: f64, quantity: f64, config: SentinelConfig) -> Self {
        Self {
            symbol,
            entry_price,
            quantity,
            config,
            highest_price_seen: entry_price,
        }
    }

    /// Update with current price and check if any trigger is hit
    pub fn check_trigger(&mut self, current_price: f64) -> Option<SentinelTrigger> {
        // Update highest price for trailing stop
        if current_price > self.highest_price_seen {
            self.highest_price_seen = current_price;
        }

        let pnl_percent = (current_price - self.entry_price) / self.entry_price;

        // Check stop loss
        if let Some(sl) = self.config.stop_loss {
            if pnl_percent <= sl {
                return Some(SentinelTrigger::StopLoss {
                    symbol: self.symbol.clone(),
                    trigger_price: current_price,
                    loss_percent: pnl_percent,
                });
            }
        }

        // Check take profit
        if let Some(tp) = self.config.take_profit {
            if pnl_percent >= tp {
                return Some(SentinelTrigger::TakeProfit {
                    symbol: self.symbol.clone(),
                    trigger_price: current_price,
                    profit_percent: pnl_percent,
                });
            }
        }

        // Check trailing stop
        if let Some(trail) = self.config.trailing_stop {
            let trail_trigger_price = self.highest_price_seen * (1.0 - trail);
            if current_price <= trail_trigger_price {
                return Some(SentinelTrigger::TrailingStop {
                    symbol: self.symbol.clone(),
                    trigger_price: current_price,
                    highest_price: self.highest_price_seen,
                });
            }
        }

        // Check moonbag (5000%+ ROI)
        if pnl_percent >= 50.0 {
            return Some(SentinelTrigger::Moonbag {
                symbol: self.symbol.clone(),
                trigger_price: current_price,
                roi_percent: pnl_percent * 100.0,
            });
        }

        None
    }
}

/// Trigger event from sentinel monitoring
#[derive(Debug, Clone)]
pub enum SentinelTrigger {
    StopLoss {
        symbol: String,
        trigger_price: f64,
        loss_percent: f64,
    },
    TakeProfit {
        symbol: String,
        trigger_price: f64,
        profit_percent: f64,
    },
    TrailingStop {
        symbol: String,
        trigger_price: f64,
        highest_price: f64,
    },
    Moonbag {
        symbol: String,
        trigger_price: f64,
        roi_percent: f64,
    },
}

/// Sentinel strategy for monitoring positions
pub struct SentinelStrategy {
    positions: Vec<TrackedPosition>,
}

impl SentinelStrategy {
    pub fn new() -> Self {
        Self {
            positions: Vec::new(),
        }
    }

    pub fn add_position(&mut self, position: TrackedPosition) {
        self.positions.push(position);
    }

    pub fn remove_position(&mut self, symbol: &str) {
        self.positions.retain(|p| p.symbol != symbol);
    }

    pub fn get_position(&self, symbol: &str) -> Option<&TrackedPosition> {
        self.positions.iter().find(|p| p.symbol == symbol)
    }

    pub fn get_position_mut(&mut self, symbol: &str) -> Option<&mut TrackedPosition> {
        self.positions.iter_mut().find(|p| p.symbol == symbol)
    }

    /// Check all positions against current prices and return any triggers
    pub fn check_all(&mut self, prices: &[(String, f64)]) -> Vec<SentinelTrigger> {
        let mut triggers = Vec::new();

        for (symbol, price) in prices {
            if let Some(position) = self.get_position_mut(symbol) {
                if let Some(trigger) = position.check_trigger(*price) {
                    triggers.push(trigger);
                }
            }
        }

        triggers
    }
}

impl Default for SentinelStrategy {
    fn default() -> Self {
        Self::new()
    }
}
