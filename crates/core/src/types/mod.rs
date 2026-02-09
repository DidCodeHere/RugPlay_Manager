//! Shared type definitions and newtypes

use serde::{Deserialize, Serialize};

/// USD amount (for clarity in function signatures)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Usd(pub f64);

impl Usd {
    pub fn new(amount: f64) -> Self {
        Usd(amount)
    }

    pub fn as_f64(&self) -> f64 {
        self.0
    }
}

/// Coin quantity (for clarity in function signatures)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CoinAmount(pub f64);

impl CoinAmount {
    pub fn new(amount: f64) -> Self {
        CoinAmount(amount)
    }

    pub fn as_f64(&self) -> f64 {
        self.0
    }

    /// Truncate to 8 decimal places (server precision)
    pub fn truncated(&self) -> Self {
        CoinAmount((self.0 * 1e8).floor() / 1e8)
    }
}

/// Price per coin in USD
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Price(pub f64);

impl Price {
    pub fn new(price: f64) -> Self {
        Price(price)
    }

    pub fn as_f64(&self) -> f64 {
        self.0
    }
}

/// Percentage value (e.g., for ROI, change)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Percent(pub f64);

impl Percent {
    pub fn new(value: f64) -> Self {
        Percent(value)
    }

    pub fn as_f64(&self) -> f64 {
        self.0
    }

    /// Check if this represents a "moonbag" condition (>= 5000% ROI)
    pub fn is_moonbag(&self) -> bool {
        self.0 >= 5000.0
    }
}
