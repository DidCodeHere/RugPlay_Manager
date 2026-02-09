//! Portfolio-related models

use serde::{Deserialize, Serialize};

/// Full portfolio response from /api/portfolio/total
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioResponse {
    pub base_currency_balance: f64,
    pub total_coin_value: f64,
    pub total_value: f64,
    pub coin_holdings: Vec<CoinHolding>,
}

/// Individual coin holding in portfolio
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinHolding {
    pub symbol: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub quantity: f64,
    pub current_price: f64,
    pub value: f64,
    #[serde(default)]
    pub change_24h: f64,
    #[serde(default)]
    pub avg_purchase_price: f64,
    #[serde(default)]
    pub percentage_change: f64,
    #[serde(default)]
    pub cost_basis: f64,
}

impl CoinHolding {
    /// Calculate profit/loss in USD
    pub fn profit_loss(&self) -> f64 {
        self.value - self.cost_basis
    }

    /// Calculate profit/loss percentage
    pub fn profit_loss_pct(&self) -> f64 {
        if self.cost_basis > 0.0 {
            ((self.value - self.cost_basis) / self.cost_basis) * 100.0
        } else {
            0.0
        }
    }

    /// Get full icon URL
    pub fn icon_url(&self) -> Option<String> {
        self.icon.as_ref().map(|i| {
            if i.starts_with("http") {
                i.clone()
            } else {
                format!("https://rugplay.com/{}", i)
            }
        })
    }
}

/// Simplified portfolio summary for header display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSummary {
    pub balance: f64,
    pub portfolio_value: f64,
    pub total_value: f64,
    pub total_profit_loss: f64,
    pub total_profit_loss_pct: f64,
    pub holdings_count: usize,
}

impl From<&PortfolioResponse> for PortfolioSummary {
    fn from(p: &PortfolioResponse) -> Self {
        let total_cost: f64 = p.coin_holdings.iter().map(|h| h.cost_basis).sum();
        let total_profit_loss = p.total_coin_value - total_cost;
        let total_profit_loss_pct = if total_cost > 0.0 {
            (total_profit_loss / total_cost) * 100.0
        } else {
            0.0
        };

        Self {
            balance: p.base_currency_balance,
            portfolio_value: p.total_coin_value,
            total_value: p.total_value,
            total_profit_loss,
            total_profit_loss_pct,
            holdings_count: p.coin_holdings.len(),
        }
    }
}
