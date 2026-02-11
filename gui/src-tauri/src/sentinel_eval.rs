use rugplay_persistence::sqlite::SentinelRow;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerType {
    StopLoss,
    TakeProfit,
    TrailingStop,
}

impl TriggerType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TriggerType::StopLoss => "stop_loss",
            TriggerType::TakeProfit => "take_profit",
            TriggerType::TrailingStop => "trailing_stop",
        }
    }
}

impl std::fmt::Display for TriggerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct TriggerResult {
    pub trigger_type: TriggerType,
    pub reason: String,
    pub trigger_price: f64,
}

/// Evaluate whether a sentinel should trigger based on the current price.
///
/// Returns `Some(TriggerResult)` if a sell should be executed, `None` otherwise.
/// Priority order: stop-loss → take-profit → trailing stop.
///
/// Stop-loss sign convention:
/// - Negative (e.g., -20) = traditional stop-loss: sell if price drops 20% below entry
/// - Positive (e.g., +50) = profit floor: sell if price drops to only 50% profit above entry,
///   but only after the coin has actually exceeded that profit level (guarded by highest_price_seen)
pub fn evaluate_sentinel(sentinel: &SentinelRow, current_price: f64) -> Option<TriggerResult> {
    let entry_price = sentinel.entry_price;

    // Stop loss
    if let Some(sl_pct) = sentinel.stop_loss_pct {
        if sl_pct < 0.0 {
            // Negative SL: traditional loss protection
            // e.g., -20 means sell if price drops 20% below entry
            let sl_price = entry_price * (1.0 + sl_pct / 100.0);
            if current_price <= sl_price {
                return Some(TriggerResult {
                    trigger_type: TriggerType::StopLoss,
                    reason: format!(
                        "Stop loss triggered at {} (SL={:.1}%, floor={})",
                        current_price, sl_pct, sl_price
                    ),
                    trigger_price: sl_price,
                });
            }
        } else if sl_pct > 0.0 {
            // Positive SL: profit floor protection
            // e.g., +50 means sell if price drops to only 50% profit above entry
            // Only arms after the coin has actually exceeded that profit level
            let sl_price = entry_price * (1.0 + sl_pct / 100.0);
            let highest = f64::max(sentinel.highest_price_seen, current_price);
            if highest > sl_price && current_price <= sl_price {
                return Some(TriggerResult {
                    trigger_type: TriggerType::StopLoss,
                    reason: format!(
                        "Profit floor triggered at {} (SL=+{:.1}%, floor={}, peak={})",
                        current_price, sl_pct, sl_price, highest
                    ),
                    trigger_price: sl_price,
                });
            }
        }
        // sl_pct == 0.0 means disabled, skip
    }

    // Take profit
    if let Some(tp_pct) = sentinel.take_profit_pct {
        let tp_price = entry_price * (1.0 + tp_pct / 100.0);
        if current_price >= tp_price {
            return Some(TriggerResult {
                trigger_type: TriggerType::TakeProfit,
                reason: format!(
                    "Take profit triggered at {} (TP={:.1}%, target={})",
                    current_price, tp_pct, tp_price
                ),
                trigger_price: tp_price,
            });
        }
    }

    // Trailing stop (skip if 0% — would always trigger)
    if let Some(ts_pct) = sentinel.trailing_stop_pct {
        if ts_pct > 0.0 {
            let highest = f64::max(sentinel.highest_price_seen, current_price);
            let ts_price = highest * (1.0 - ts_pct / 100.0);
            if current_price <= ts_price {
                return Some(TriggerResult {
                    trigger_type: TriggerType::TrailingStop,
                    reason: format!(
                        "Trailing stop triggered at {} (TS={:.1}%, highest={}, target={})",
                        current_price, ts_pct, highest, ts_price
                    ),
                    trigger_price: ts_price,
                });
            }
        }
    }

    None
}
