//! Dip Buyer Signal Analysis — Confidence Scoring Engine
//!
//! Replaces the old pass/fail pipeline with a weighted multi-signal
//! confidence score. Each signal contributes a normalized 0.0–1.0 value
//! multiplied by its weight. The composite score determines whether to buy
//! and at what sizing.

use rugplay_core::{CoinDetails, CandlestickPoint};
use rugplay_core::{CoinHoldersResponse, RecentTrade};
use serde::{Deserialize, Serialize};

// ─── Signal Breakdown ────────────────────────────────────────────────

/// Individual signal result with raw value and normalized score
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalResult {
    pub name: String,
    pub raw_value: f64,
    pub score: f64,       // 0.0–1.0 normalized
    pub weight: f64,
    pub weighted: f64,    // score * weight
    pub reason: String,
}

/// Complete analysis result for a dip candidate
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DipAnalysis {
    pub symbol: String,
    pub confidence_score: f64,
    pub signals: Vec<SignalResult>,
    pub hard_reject: bool,
    pub reject_reason: Option<String>,
    pub recommended_buy_pct: f64,   // 0.0–1.0 multiplier on base buy amount
    pub slippage_pct: f64,
    pub sell_impact_pct: f64,
}

/// Weights for each signal component (user-configurable)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalWeights {
    pub sell_impact: f64,       // How significant was the sell relative to pool depth
    pub holder_safety: f64,     // Holder distribution health
    pub momentum: f64,          // Short-term price trend (from candles)
    pub volume_quality: f64,    // Volume/liquidity ratio
}

impl Default for SignalWeights {
    fn default() -> Self {
        Self {
            sell_impact: 0.35,
            holder_safety: 0.30,
            momentum: 0.20,
            volume_quality: 0.15,
        }
    }
}

// ─── Signal Calculations ─────────────────────────────────────────────

/// Calculate the price impact a sell trade caused on the pool using AMM math.
/// Returns (impact_pct, is_significant).
/// sell_value_usd: the USD value of the sell from the trade feed.
/// pool_base: poolBaseCurrencyAmount (USD side of pool).
pub fn calc_sell_impact(sell_value_usd: f64, pool_base: f64) -> (f64, SignalResult) {
    if pool_base <= 0.0 {
        return (0.0, SignalResult {
            name: "Sell Impact".into(),
            raw_value: 0.0,
            score: 0.0,
            weight: 0.0,
            weighted: 0.0,
            reason: "Pool data unavailable".into(),
        });
    }

    // In a constant-product AMM, when someone sells coins worth $V,
    // the USD drained from pool = V, so impact ~ V / pool_base
    let impact_ratio = sell_value_usd / pool_base;
    let impact_pct = impact_ratio * 100.0;

    // Score: We want meaningful dips (2-15% impact range is the sweet spot)
    // <1% = noise (score 0), 2-5% = moderate dip, 5-15% = strong dip, >20% = dangerous
    let score = if impact_pct < 1.0 {
        0.0
    } else if impact_pct > 25.0 {
        0.1 // Extremely large sell — dangerous, but not zero
    } else if impact_pct > 15.0 {
        0.4 // Very large — risky but could bounce
    } else {
        // 1% to 15% → linearly map to 0.3–1.0
        0.3 + (impact_pct - 1.0) / 14.0 * 0.7
    };

    let reason = format!("Sell ${:.0} on ${:.0} pool = {:.2}% impact", sell_value_usd, pool_base, impact_pct);

    (impact_pct, SignalResult {
        name: "Sell Impact".into(),
        raw_value: impact_pct,
        score,
        weight: 0.0, // set by caller
        weighted: 0.0,
        reason,
    })
}

/// Calculate slippage our buy would cause on the pool.
/// Returns the slippage percentage.
pub fn calc_buy_slippage(buy_amount_usd: f64, pool_base: f64) -> f64 {
    if pool_base <= 0.0 {
        return 100.0;
    }
    // Slippage for a buy of $B into pool with $Y base:
    // effective_price / spot_price = (Y + B) / Y = 1 + B/Y
    // slippage_pct = (B / Y) * 100
    (buy_amount_usd / pool_base) * 100.0
}

/// Analyze holder distribution for safety signals.
/// Returns a composite safety score and optionally a hard rejection.
pub fn calc_holder_safety(
    holders: &CoinHoldersResponse,
    seller_user_id: Option<u32>,
    creator_id: Option<&str>,
    skip_top_n: u32,
) -> (bool, Option<String>, SignalResult) {
    let holder_list = &holders.holders;
    let total_holders = holders.total_holders;

    // Hard reject: top-1 holder owns >60% → extreme rug risk
    if let Some(top) = holder_list.first() {
        if top.percentage > 60.0 {
            return (true, Some(format!(
                "Top holder owns {:.1}% — extreme concentration risk", top.percentage
            )), SignalResult {
                name: "Holder Safety".into(),
                raw_value: top.percentage,
                score: 0.0,
                weight: 0.0,
                weighted: 0.0,
                reason: format!("Top holder: {:.1}% (REJECT)", top.percentage),
            });
        }
    }

    // Hard reject: seller IS a top-N holder (whale dumping)
    if let Some(sid) = seller_user_id {
        for h in holder_list.iter() {
            if h.user_id == sid && h.rank <= skip_top_n {
                return (true, Some(format!(
                    "Seller is rank {} holder — whale dump", h.rank
                )), SignalResult {
                    name: "Holder Safety".into(),
                    raw_value: h.rank as f64,
                    score: 0.0,
                    weight: 0.0,
                    weighted: 0.0,
                    reason: format!("Seller is top {} holder (REJECT)", h.rank),
                });
            }
        }
    }

    let mut reasons = Vec::new();

    // Factor 1: Top-10 concentration (lower is healthier)
    let top10_pct: f64 = holder_list.iter()
        .filter(|h| h.rank <= 10)
        .map(|h| h.percentage)
        .sum();

    // Map 60%+ → 0.0, 20% → 1.0
    let concentration_score = if top10_pct >= 60.0 {
        0.0
    } else if top10_pct <= 20.0 {
        1.0
    } else {
        (60.0 - top10_pct) / 40.0
    };
    reasons.push(format!("Top10: {:.1}%", top10_pct));

    // Factor 2: Creator holding check
    let mut creator_score = 1.0;
    if let Some(cid) = creator_id {
        if let Ok(cid_num) = cid.parse::<u32>() {
            if let Some(creator_h) = holder_list.iter().find(|h| h.user_id == cid_num) {
                if creator_h.percentage > 20.0 {
                    creator_score = 0.1;
                    reasons.push(format!("Creator holds {:.1}%!", creator_h.percentage));
                } else if creator_h.percentage > 5.0 {
                    creator_score = 0.5;
                    reasons.push(format!("Creator holds {:.1}%", creator_h.percentage));
                } else {
                    reasons.push(format!("Creator: {:.1}% (safe)", creator_h.percentage));
                }
            } else {
                creator_score = 1.0; // Creator not in top 20 — good
                reasons.push("Creator not in top 20".into());
            }
        }
    }

    // Factor 3: Total holders as maturity signal
    let maturity_score = if total_holders < 5 {
        0.1
    } else if total_holders < 20 {
        0.4
    } else if total_holders < 50 {
        0.7
    } else {
        1.0
    };
    reasons.push(format!("{} holders", total_holders));

    // Weighted combination within this signal
    let score = concentration_score * 0.5 + creator_score * 0.3 + maturity_score * 0.2;

    (false, None, SignalResult {
        name: "Holder Safety".into(),
        raw_value: top10_pct,
        score,
        weight: 0.0,
        weighted: 0.0,
        reason: reasons.join(", "),
    })
}

/// Analyze candlestick data for short-term momentum.
/// Looks for exhaustion signals (oversold bounce potential) vs ongoing crash.
pub fn calc_momentum(candles: &[CandlestickPoint], current_price: f64) -> SignalResult {
    if candles.len() < 3 {
        return SignalResult {
            name: "Momentum".into(),
            raw_value: 0.0,
            score: 0.5, // Neutral when no data
            weight: 0.0,
            weighted: 0.0,
            reason: "Insufficient candle data".into(),
        };
    }

    // Use the last N candles (up to 20)
    let recent: Vec<&CandlestickPoint> = candles.iter().rev().take(20).collect();
    let n = recent.len();

    // Consecutive red candles (close < open) — selling pressure indicator
    let mut consecutive_red = 0u32;
    for c in &recent {
        if c.close < c.open {
            consecutive_red += 1;
        } else {
            break;
        }
    }

    // Price relative to recent high/low range
    let recent_high = recent.iter().map(|c| c.high).fold(f64::NEG_INFINITY, f64::max);
    let recent_low = recent.iter().map(|c| c.low).fold(f64::INFINITY, f64::min);
    let range = recent_high - recent_low;

    let position_in_range = if range > 0.0 {
        (current_price - recent_low) / range
    } else {
        0.5
    };

    // Average body size (volatility indicator)
    let avg_body: f64 = recent.iter()
        .map(|c| (c.close - c.open).abs())
        .sum::<f64>() / n as f64;
    let avg_price = recent.iter().map(|c| c.close).sum::<f64>() / n as f64;
    let body_pct = if avg_price > 0.0 { avg_body / avg_price * 100.0 } else { 0.0 };

    // Selling exhaustion: price near the bottom of range + multiple red candles
    // means sellers are exhausted → higher reversion probability
    let mut score;

    if consecutive_red >= 5 {
        // Extended dump — could be freefall or exhaustion
        if position_in_range < 0.15 {
            score = 0.8; // Near bottom after 5+ red candles → likely exhaustion
        } else {
            score = 0.2; // Still has room to fall
        }
    } else if consecutive_red >= 3 {
        // Moderate selling pressure
        score = if position_in_range < 0.25 { 0.7 } else { 0.4 };
    } else if consecutive_red == 0 {
        // Last candle was green — possible recovery already starting
        if position_in_range < 0.3 {
            score = 0.9; // Green candle near the bottom → strong reversal signal
        } else {
            score = 0.5; // Normal action
        }
    } else {
        score = 0.5; // 1-2 red candles, neutral
    }

    // Penalize if price is still in the middle/upper range (not a real dip)
    if position_in_range > 0.5 {
        score *= 0.6;
    }

    let reason = format!(
        "{} red candles, price at {:.0}% of range, body vol {:.2}%",
        consecutive_red, position_in_range * 100.0, body_pct
    );

    SignalResult {
        name: "Momentum".into(),
        raw_value: position_in_range,
        score,
        weight: 0.0,
        weighted: 0.0,
        reason,
    }
}

/// Evaluate volume quality — ratio of 24h volume to pool liquidity.
/// High turnover with deep liquidity = healthy market.
pub fn calc_volume_quality(volume_24h: f64, pool_base: f64, market_cap: f64) -> SignalResult {
    if pool_base <= 0.0 || market_cap <= 0.0 {
        return SignalResult {
            name: "Volume Quality".into(),
            raw_value: 0.0,
            score: 0.3,
            weight: 0.0,
            weighted: 0.0,
            reason: "No pool data".into(),
        };
    }

    // Volume-to-liquidity ratio: high = active trading, good for mean reversion
    let vol_liq_ratio = volume_24h / pool_base;

    // Volume-to-mcap ratio: indicates how actively traded the coin is
    let vol_mcap_ratio = volume_24h / market_cap;

    let score = if vol_liq_ratio > 2.0 && vol_mcap_ratio > 0.1 {
        1.0 // Very actively traded
    } else if vol_liq_ratio > 0.5 && vol_mcap_ratio > 0.05 {
        0.7 // Decently traded
    } else if vol_liq_ratio > 0.1 {
        0.4 // Low activity
    } else {
        0.1 // Dead coin
    };

    let reason = format!(
        "Vol/Liq: {:.2}x, Vol/MCap: {:.1}%",
        vol_liq_ratio, vol_mcap_ratio * 100.0
    );

    SignalResult {
        name: "Volume Quality".into(),
        raw_value: vol_liq_ratio,
        score,
        weight: 0.0,
        weighted: 0.0,
        reason,
    }
}

// ─── Composite Score ─────────────────────────────────────────────────

/// Run the full analysis pipeline on a dip candidate.
pub fn analyze_dip(
    symbol: &str,
    sell_trade: &RecentTrade,
    coin: &CoinDetails,
    chart_data: &[CandlestickPoint],
    holders: &CoinHoldersResponse,
    buy_amount_usd: f64,
    weights: &SignalWeights,
    skip_top_n: u32,
    max_slippage_pct: f64,
) -> DipAnalysis {
    let pool_base = holders.pool_info.base_currency_amount;

    // Signal 1: Sell impact analysis
    let (sell_impact_pct, mut s_impact) = calc_sell_impact(sell_trade.total_value, pool_base);
    s_impact.weight = weights.sell_impact;

    // Signal 2: Holder safety
    let seller_id_u32: Option<u32> = sell_trade.user_id.parse().ok();
    let creator_id = coin.creator_id.as_deref();
    let (hard_reject, reject_reason, mut s_holders) = calc_holder_safety(
        holders, seller_id_u32, creator_id, skip_top_n,
    );

    if hard_reject {
        s_holders.weight = weights.holder_safety;
        return DipAnalysis {
            symbol: symbol.to_string(),
            confidence_score: 0.0,
            signals: vec![s_impact, s_holders],
            hard_reject: true,
            reject_reason,
            recommended_buy_pct: 0.0,
            slippage_pct: 0.0,
            sell_impact_pct,
        };
    }
    s_holders.weight = weights.holder_safety;

    // Signal 3: Momentum from candles
    let mut s_momentum = calc_momentum(chart_data, coin.current_price);
    s_momentum.weight = weights.momentum;

    // Signal 4: Volume quality
    let mut s_volume = calc_volume_quality(coin.volume_24h, pool_base, coin.market_cap);
    s_volume.weight = weights.volume_quality;

    // Calculate slippage for our buy
    let slippage_pct = calc_buy_slippage(buy_amount_usd, pool_base);

    // Hard reject: our buy would cause too much slippage
    if max_slippage_pct > 0.0 && slippage_pct > max_slippage_pct {
        return DipAnalysis {
            symbol: symbol.to_string(),
            confidence_score: 0.0,
            signals: vec![s_impact, s_holders, s_momentum, s_volume],
            hard_reject: true,
            reject_reason: Some(format!(
                "Buy slippage {:.2}% exceeds max {:.1}%", slippage_pct, max_slippage_pct
            )),
            recommended_buy_pct: 0.0,
            slippage_pct,
            sell_impact_pct,
        };
    }

    // Calculate weighted scores
    s_impact.weighted = s_impact.score * s_impact.weight;
    s_holders.weighted = s_holders.score * s_holders.weight;
    s_momentum.weighted = s_momentum.score * s_momentum.weight;
    s_volume.weighted = s_volume.score * s_volume.weight;

    let total_weight = s_impact.weight + s_holders.weight + s_momentum.weight + s_volume.weight;
    let composite = if total_weight > 0.0 {
        (s_impact.weighted + s_holders.weighted + s_momentum.weighted + s_volume.weighted) / total_weight
    } else {
        0.0
    };

    // Buy sizing: scale amount based on confidence
    // >= 0.75 → 100%, 0.55–0.75 → 50–100% linear, < 0.55 → 0% (no buy)
    let recommended_buy_pct = if composite >= 0.75 {
        1.0
    } else if composite >= 0.55 {
        0.5 + (composite - 0.55) / 0.20 * 0.5
    } else {
        0.0
    };

    DipAnalysis {
        symbol: symbol.to_string(),
        confidence_score: composite,
        signals: vec![s_impact, s_holders, s_momentum, s_volume],
        hard_reject: false,
        reject_reason: None,
        recommended_buy_pct,
        slippage_pct,
        sell_impact_pct,
    }
}
