//! Risk limits and controls

/// Global risk limits for the portfolio
#[derive(Debug, Clone)]
pub struct RiskLimits {
    /// Maximum percentage of portfolio to lose in a day before stopping
    pub daily_loss_limit: f64,
    /// Maximum single trade size in USD
    pub max_trade_size: f64,
    /// Maximum number of concurrent positions
    pub max_positions: usize,
    /// Minimum balance to maintain (stop trading below this)
    pub min_balance: f64,
}

impl Default for RiskLimits {
    fn default() -> Self {
        Self {
            daily_loss_limit: 0.20, // 20% daily loss limit
            max_trade_size: 1000.0,
            max_positions: 10,
            min_balance: 100.0,
        }
    }
}

/// Check if a trade is within risk limits
pub fn check_trade_allowed(
    limits: &RiskLimits,
    current_balance: f64,
    trade_size: f64,
    current_positions: usize,
) -> Result<(), RiskViolation> {
    if current_balance < limits.min_balance {
        return Err(RiskViolation::BelowMinBalance {
            current: current_balance,
            minimum: limits.min_balance,
        });
    }

    if trade_size > limits.max_trade_size {
        return Err(RiskViolation::ExceedsMaxTradeSize {
            requested: trade_size,
            maximum: limits.max_trade_size,
        });
    }

    if current_positions >= limits.max_positions {
        return Err(RiskViolation::TooManyPositions {
            current: current_positions,
            maximum: limits.max_positions,
        });
    }

    Ok(())
}

/// Risk limit violation
#[derive(Debug, Clone)]
pub enum RiskViolation {
    BelowMinBalance { current: f64, minimum: f64 },
    ExceedsMaxTradeSize { requested: f64, maximum: f64 },
    TooManyPositions { current: usize, maximum: usize },
    DailyLossLimitHit { loss_percent: f64, limit: f64 },
}
