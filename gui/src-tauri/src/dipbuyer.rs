//! Dip Buyer — Buy dips when non-top holders sell large chunks
//!
//! Monitors the live trade feed for large SELL trades, then checks
//! whether the seller is among the top N holders. If a non-top holder
//! dumps while top holders remain, and the coin meets liquidity/volume
//! filters, the bot buys the dip via the trade executor.

use crate::dipbuyer_signals::{DipAnalysis, SignalWeights, analyze_dip};
use crate::notifications::NotificationHandle;
use crate::trade_executor::{TradeExecutorHandle, TradePriority};
use crate::AppState;
use rugplay_core::TradeType;
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::{watch, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info};

const DEFAULT_POLL_INTERVAL_SECS: u64 = 5;

// ─── Aggressiveness Presets ──────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Aggressiveness {
    Conservative,
    Moderate,
    Aggressive,
}

impl Aggressiveness {
    pub fn to_preset(&self) -> DipBuyerConfig {
        match self {
            Aggressiveness::Conservative => DipBuyerConfig {
                preset: Aggressiveness::Conservative,
                buy_amount_usd: 500.0,
                coin_tiers: vec![
                    CoinTier { label: "Small".into(), min_mcap: 1_000.0, max_mcap: 10_000.0, buy_amount_usd: 100.0, min_sell_value_usd: 3_000.0, min_volume_24h: 5_000.0, max_buy_slippage_pct: 2.0 },
                    CoinTier { label: "Medium".into(), min_mcap: 10_000.0, max_mcap: 100_000.0, buy_amount_usd: 300.0, min_sell_value_usd: 5_000.0, min_volume_24h: 10_000.0, max_buy_slippage_pct: 3.0 },
                    CoinTier { label: "Large".into(), min_mcap: 100_000.0, max_mcap: 1_000_000.0, buy_amount_usd: 500.0, min_sell_value_usd: 8_000.0, min_volume_24h: 20_000.0, max_buy_slippage_pct: 0.0 },
                    CoinTier { label: "Mega".into(), min_mcap: 1_000_000.0, max_mcap: 0.0, buy_amount_usd: 750.0, min_sell_value_usd: 10_000.0, min_volume_24h: 50_000.0, max_buy_slippage_pct: 0.0 },
                ],
                use_coin_tiers: true,
                min_sell_value_usd: 5000.0,
                min_volume_24h: 10_000.0,
                min_market_cap: 100_000.0,
                max_market_cap: 0.0,
                skip_top_n_holders: 2,
                max_price_drop_pct: -5.0,
                poll_interval_secs: 5,
                cooldown_per_coin_secs: 300,
                max_daily_buys: 5,
                max_daily_spend_usd: 5000.0,
                auto_create_sentinel: true,
                stop_loss_pct: -10.0,
                take_profit_pct: 200.0,
                trailing_stop_pct: None,
                blacklisted_coins: Vec::new(),
                min_confidence_score: 0.65,
                max_buy_slippage_pct: 3.0,
                use_momentum_analysis: true,
                signal_weights: SignalWeights {
                    sell_impact: 0.30,
                    holder_safety: 0.40,
                    momentum: 0.20,
                    volume_quality: 0.10,
                },
                scale_by_confidence: true,
                max_position_pct: 5.0,
                portfolio_aware: true,
            },
            Aggressiveness::Moderate => DipBuyerConfig {
                preset: Aggressiveness::Moderate,
                buy_amount_usd: 1000.0,
                coin_tiers: vec![
                    CoinTier { label: "Small".into(), min_mcap: 1_000.0, max_mcap: 10_000.0, buy_amount_usd: 200.0, min_sell_value_usd: 1_000.0, min_volume_24h: 3_000.0, max_buy_slippage_pct: 5.0 },
                    CoinTier { label: "Medium".into(), min_mcap: 10_000.0, max_mcap: 100_000.0, buy_amount_usd: 500.0, min_sell_value_usd: 3_000.0, min_volume_24h: 5_000.0, max_buy_slippage_pct: 5.0 },
                    CoinTier { label: "Large".into(), min_mcap: 100_000.0, max_mcap: 1_000_000.0, buy_amount_usd: 1000.0, min_sell_value_usd: 5_000.0, min_volume_24h: 10_000.0, max_buy_slippage_pct: 0.0 },
                    CoinTier { label: "Mega".into(), min_mcap: 1_000_000.0, max_mcap: 0.0, buy_amount_usd: 1500.0, min_sell_value_usd: 10_000.0, min_volume_24h: 25_000.0, max_buy_slippage_pct: 0.0 },
                ],
                use_coin_tiers: true,
                min_sell_value_usd: 2000.0,
                min_volume_24h: 5_000.0,
                min_market_cap: 20_000.0,
                max_market_cap: 0.0,
                skip_top_n_holders: 2,
                max_price_drop_pct: -5.0,
                poll_interval_secs: 5,
                cooldown_per_coin_secs: 180,
                max_daily_buys: 10,
                max_daily_spend_usd: 15000.0,
                auto_create_sentinel: true,
                stop_loss_pct: -30.0,
                take_profit_pct: 500.0,
                trailing_stop_pct: None,
                blacklisted_coins: Vec::new(),
                min_confidence_score: 0.55,
                max_buy_slippage_pct: 5.0,
                use_momentum_analysis: true,
                signal_weights: SignalWeights::default(),
                scale_by_confidence: true,
                max_position_pct: 10.0,
                portfolio_aware: true,
            },
            Aggressiveness::Aggressive => DipBuyerConfig {
                preset: Aggressiveness::Aggressive,
                buy_amount_usd: 2000.0,
                coin_tiers: vec![
                    CoinTier { label: "Small".into(), min_mcap: 1_000.0, max_mcap: 10_000.0, buy_amount_usd: 500.0, min_sell_value_usd: 500.0, min_volume_24h: 1_000.0, max_buy_slippage_pct: 10.0 },
                    CoinTier { label: "Medium".into(), min_mcap: 10_000.0, max_mcap: 100_000.0, buy_amount_usd: 1000.0, min_sell_value_usd: 1_000.0, min_volume_24h: 2_000.0, max_buy_slippage_pct: 8.0 },
                    CoinTier { label: "Large".into(), min_mcap: 100_000.0, max_mcap: 1_000_000.0, buy_amount_usd: 2000.0, min_sell_value_usd: 2_000.0, min_volume_24h: 5_000.0, max_buy_slippage_pct: 0.0 },
                    CoinTier { label: "Mega".into(), min_mcap: 1_000_000.0, max_mcap: 0.0, buy_amount_usd: 3000.0, min_sell_value_usd: 5_000.0, min_volume_24h: 10_000.0, max_buy_slippage_pct: 0.0 },
                ],
                use_coin_tiers: true,
                min_sell_value_usd: 1000.0,
                min_volume_24h: 2_000.0,
                min_market_cap: 10_000.0,
                max_market_cap: 0.0,
                skip_top_n_holders: 1,
                max_price_drop_pct: -10.0,
                poll_interval_secs: 3,
                cooldown_per_coin_secs: 60,
                max_daily_buys: 20,
                max_daily_spend_usd: 50000.0,
                auto_create_sentinel: true,
                stop_loss_pct: -50.0,
                take_profit_pct: 1000.0,
                trailing_stop_pct: None,
                blacklisted_coins: Vec::new(),
                min_confidence_score: 0.45,
                max_buy_slippage_pct: 10.0,
                use_momentum_analysis: true,
                signal_weights: SignalWeights {
                    sell_impact: 0.40,
                    holder_safety: 0.25,
                    momentum: 0.20,
                    volume_quality: 0.15,
                },
                scale_by_confidence: false,
                max_position_pct: 0.0,
                portfolio_aware: false,
            },
        }
    }
}

// ─── Coin Tier ───────────────────────────────────────────────────────

/// Per-market-cap-range settings: buy sizing AND entry filters.
/// When tiers are enabled, the first matching tier's values are used
/// instead of the global defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinTier {
    pub label: String,
    pub min_mcap: f64,
    pub max_mcap: f64, // 0 = no upper limit
    pub buy_amount_usd: f64,
    /// Min sell value to trigger analysis for this tier (overrides global)
    #[serde(default)]
    pub min_sell_value_usd: f64,
    /// Min 24h volume for this tier (overrides global)
    #[serde(default)]
    pub min_volume_24h: f64,
    /// Max slippage % for this tier (overrides global, 0 = use global)
    #[serde(default)]
    pub max_buy_slippage_pct: f64,
}

impl CoinTier {
    fn matches(&self, mcap: f64) -> bool {
        mcap >= self.min_mcap && (self.max_mcap <= 0.0 || mcap < self.max_mcap)
    }
}

/// Values resolved from a matching tier (or global fallbacks)
#[derive(Debug, Clone)]
pub struct ResolvedTierSettings {
    pub buy_amount_usd: f64,
    pub min_sell_value_usd: f64,
    pub min_volume_24h: f64,
    pub max_buy_slippage_pct: f64,
    pub tier_label: Option<String>,
}

// ─── Config ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerConfig {
    pub preset: Aggressiveness,
    /// Default USD amount to buy per dip (used when no tier matches)
    pub buy_amount_usd: f64,
    /// Market-cap-based coin tiers with per-tier filters (checked in order, first match wins)
    #[serde(default, alias = "buyTiers")]
    pub coin_tiers: Vec<CoinTier>,
    /// Whether to use tiers instead of flat global settings
    #[serde(default, alias = "useBuyTiers")]
    pub use_coin_tiers: bool,
    /// Minimum USD value of the sell trade to trigger analysis
    pub min_sell_value_usd: f64,
    /// Minimum 24h volume for the coin
    pub min_volume_24h: f64,
    /// Minimum market cap
    pub min_market_cap: f64,
    /// Maximum market cap (0 = no limit)
    pub max_market_cap: f64,
    /// Skip the top N holders when deciding if a sell is a "dip" vs a "rug"
    pub skip_top_n_holders: u32,
    /// Maximum 24h price change to still consider (e.g. -50 means skip if already dropped >50%)
    pub max_price_drop_pct: f64,
    /// Polling interval in seconds
    pub poll_interval_secs: u64,
    /// Cooldown per coin in seconds (don't buy same coin twice in this window)
    pub cooldown_per_coin_secs: u64,
    /// Maximum buys per 24h rolling window
    pub max_daily_buys: u32,
    /// Maximum USD spent per 24h rolling window
    pub max_daily_spend_usd: f64,
    /// Auto-create sentinel after buying
    pub auto_create_sentinel: bool,
    pub stop_loss_pct: f64,
    pub take_profit_pct: f64,
    pub trailing_stop_pct: Option<f64>,
    /// Coins to never buy
    pub blacklisted_coins: Vec<String>,

    // ── Signal Analysis (v1.2) ──────────────────────────────
    /// Minimum confidence score (0.0–1.0) to execute a buy
    #[serde(default = "default_min_confidence")]
    pub min_confidence_score: f64,
    /// Maximum slippage % our buy can cause (0 = disabled)
    #[serde(default = "default_max_slippage")]
    pub max_buy_slippage_pct: f64,
    /// Use candlestick momentum analysis
    #[serde(default = "default_true")]
    pub use_momentum_analysis: bool,
    /// Signal weights
    #[serde(default)]
    pub signal_weights: SignalWeights,
    /// Scale buy amount by confidence (high confidence = full amount, lower = reduced)
    #[serde(default = "default_true")]
    pub scale_by_confidence: bool,
    /// Max % of portfolio value to hold in any single coin (0 = disabled)
    #[serde(default)]
    pub max_position_pct: f64,
    /// Check existing holdings before buying
    #[serde(default = "default_true")]
    pub portfolio_aware: bool,
}

fn default_min_confidence() -> f64 { 0.55 }
fn default_max_slippage() -> f64 { 5.0 }
fn default_true() -> bool { true }

impl Default for DipBuyerConfig {
    fn default() -> Self {
        Aggressiveness::Moderate.to_preset()
    }
}

impl DipBuyerConfig {
    /// Resolve per-tier settings for a coin based on its market cap.
    /// If tiers are enabled and one matches, the tier's non-zero values
    /// override the global defaults. Unset tier values (0) fall back to globals.
    pub fn resolve_tier(&self, market_cap: f64) -> ResolvedTierSettings {
        if self.use_coin_tiers {
            for tier in &self.coin_tiers {
                if tier.matches(market_cap) {
                    return ResolvedTierSettings {
                        buy_amount_usd: tier.buy_amount_usd,
                        min_sell_value_usd: if tier.min_sell_value_usd > 0.0 {
                            tier.min_sell_value_usd
                        } else {
                            self.min_sell_value_usd
                        },
                        min_volume_24h: if tier.min_volume_24h > 0.0 {
                            tier.min_volume_24h
                        } else {
                            self.min_volume_24h
                        },
                        max_buy_slippage_pct: if tier.max_buy_slippage_pct > 0.0 {
                            tier.max_buy_slippage_pct
                        } else {
                            self.max_buy_slippage_pct
                        },
                        tier_label: Some(tier.label.clone()),
                    };
                }
            }
        }
        ResolvedTierSettings {
            buy_amount_usd: self.buy_amount_usd,
            min_sell_value_usd: self.min_sell_value_usd,
            min_volume_24h: self.min_volume_24h,
            max_buy_slippage_pct: self.max_buy_slippage_pct,
            tier_label: None,
        }
    }
}

// ─── Events ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerTriggeredEvent {
    pub symbol: String,
    pub coin_name: String,
    pub buy_amount_usd: f64,
    pub seller_username: String,
    pub sell_value_usd: f64,
    pub seller_rank: Option<u32>,
    pub market_cap: f64,
    pub price: f64,
    pub change_24h: f64,
    pub confidence_score: f64,
    pub slippage_pct: f64,
    pub sell_impact_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerTickEvent {
    pub enabled: bool,
    pub total_bought: u32,
    pub last_bought_at: Option<String>,
    pub trades_scanned: u32,
    pub dips_detected: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerSkippedEvent {
    pub symbol: String,
    pub seller_username: String,
    pub sell_value_usd: f64,
    pub reason: String,
}

// ─── Handle ──────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct DipBuyerHandle {
    enabled_tx: Arc<watch::Sender<bool>>,
    config: Arc<RwLock<DipBuyerConfig>>,
    cancel: CancellationToken,
}

impl DipBuyerHandle {
    pub fn is_enabled(&self) -> bool {
        *self.enabled_tx.borrow()
    }

    pub fn enable(&self) {
        let _ = self.enabled_tx.send(true);
        info!("DipBuyer enabled");
    }

    pub fn disable(&self) {
        let _ = self.enabled_tx.send(false);
        info!("DipBuyer disabled");
    }

    pub async fn get_config(&self) -> DipBuyerConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, config: DipBuyerConfig) {
        *self.config.write().await = config;
        info!("DipBuyer config updated");
    }

    pub fn stop(&self) {
        self.cancel.cancel();
    }
}

// ─── Spawn ───────────────────────────────────────────────────────────

pub fn spawn_dipbuyer(
    app_handle: tauri::AppHandle,
    executor: TradeExecutorHandle,
) -> DipBuyerHandle {
    let (enabled_tx, enabled_rx) = watch::channel(false);
    let config = Arc::new(RwLock::new(DipBuyerConfig::default()));
    let cancel = CancellationToken::new();

    let handle = DipBuyerHandle {
        enabled_tx: Arc::new(enabled_tx),
        config: config.clone(),
        cancel: cancel.clone(),
    };

    let restore_handle = handle.clone();
    let restore_app = app_handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let saved_enabled = load_dipbuyer_enabled(&restore_app).await;
        if saved_enabled {
            restore_handle.enable();
            info!("DipBuyer: restored enabled state from DB");
        }
    });

    tokio::spawn(dipbuyer_loop(app_handle, enabled_rx, config, executor, cancel));

    handle
}

// ─── Loop ────────────────────────────────────────────────────────────

async fn dipbuyer_loop(
    app_handle: tauri::AppHandle,
    mut enabled_rx: watch::Receiver<bool>,
    config: Arc<RwLock<DipBuyerConfig>>,
    executor: TradeExecutorHandle,
    cancel: CancellationToken,
) {
    info!("DipBuyer loop started");

    // State tracking
    let mut seen_trade_keys: HashSet<String> = HashSet::new();
    let mut total_bought: u32 = load_dipbuyer_total(&app_handle).await;
    let mut last_bought_at: Option<String> = load_dipbuyer_last_at(&app_handle).await;
    let mut coin_cooldowns: HashMap<String, i64> = HashMap::new();
    let mut daily_buys: Vec<(i64, f64)> = Vec::new(); // (timestamp, usd_amount)

    // Restore state from automation_log so restarts don't cause duplicate buys
    let mut last_tick_ts = load_dipbuyer_last_tick_ts(&app_handle).await;
    restore_state_from_log(
        &app_handle,
        &mut coin_cooldowns,
        &mut daily_buys,
        &mut seen_trade_keys,
        last_tick_ts,
    ).await;

    if let Some(saved_config) = load_dipbuyer_config(&app_handle).await {
        *config.write().await = saved_config;
    }

    let mut interval = tokio::time::interval(
        std::time::Duration::from_secs(DEFAULT_POLL_INTERVAL_SECS),
    );

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("DipBuyer cancelled, exiting");
                return;
            }
            _ = interval.tick() => {
                let enabled = *enabled_rx.borrow_and_update();

                if !enabled {
                    let tick = DipBuyerTickEvent {
                        enabled: false,
                        total_bought,
                        last_bought_at: last_bought_at.clone(),
                        trades_scanned: 0,
                        dips_detected: 0,
                    };
                    let _ = app_handle.emit("dipbuyer-tick", &tick);
                    continue;
                }

                let token = match get_active_token(&app_handle).await {
                    Ok(t) => t,
                    Err(e) => {
                        debug!("DipBuyer: no active profile: {}", e);
                        continue;
                    }
                };

                let client = RugplayClient::new_with_cache(&token, {
                    let state = app_handle.state::<AppState>();
                    state.coin_cache.clone()
                });
                let cfg = config.read().await.clone();

                // Update interval if config changed
                let desired_interval = if cfg.poll_interval_secs > 0 {
                    cfg.poll_interval_secs
                } else {
                    DEFAULT_POLL_INTERVAL_SECS
                };
                let current_period = interval.period();
                if current_period != std::time::Duration::from_secs(desired_interval) {
                    interval = tokio::time::interval(
                        std::time::Duration::from_secs(desired_interval),
                    );
                }

                let now_epoch = chrono::Utc::now().timestamp();

                // Prune expired cooldowns
                coin_cooldowns.retain(|_, ts| now_epoch - *ts < cfg.cooldown_per_coin_secs as i64);

                // Prune daily buys > 24h
                daily_buys.retain(|(ts, _)| now_epoch - *ts < 86400);
                let buys_today: u32 = daily_buys.len() as u32;
                let spent_today: f64 = daily_buys.iter().map(|(_, a)| a).sum();

                if buys_today >= cfg.max_daily_buys {
                    debug!("DipBuyer: daily buy limit reached ({}/{})", buys_today, cfg.max_daily_buys);
                    let tick = DipBuyerTickEvent {
                        enabled: true,
                        total_bought,
                        last_bought_at: last_bought_at.clone(),
                        trades_scanned: 0,
                        dips_detected: 0,
                    };
                    let _ = app_handle.emit("dipbuyer-tick", &tick);
                    continue;
                }

                if cfg.max_daily_spend_usd > 0.0 && spent_today >= cfg.max_daily_spend_usd {
                    debug!("DipBuyer: daily spend limit reached (${:.2} / ${:.2})", spent_today, cfg.max_daily_spend_usd);
                    continue;
                }

                // Poll recent trades
                let trades = match client.get_recent_trades(50).await {
                    Ok(t) => t,
                    Err(e) => {
                        error!("DipBuyer: failed to fetch recent trades: {}", e);
                        continue;
                    }
                };

                let mut trades_scanned = 0u32;
                let mut dips_detected = 0u32;
                let mut max_trade_ts: i64 = last_tick_ts;

                for trade in &trades {
                    trades_scanned += 1;

                    // Skip trades we already evaluated before restart
                    if trade.timestamp > 0 && trade.timestamp <= last_tick_ts {
                        continue;
                    }

                    // Track the newest trade timestamp for persistence
                    if trade.timestamp > max_trade_ts {
                        max_trade_ts = trade.timestamp;
                    }

                    // Only interested in SELL trades
                    if trade.trade_type.to_uppercase() != "SELL" {
                        continue;
                    }

                    // Deduplicate: use a key of (userId, symbol, timestamp, amount)
                    let trade_key = format!(
                        "{}:{}:{}:{:.4}",
                        trade.user_id, trade.coin_symbol, trade.timestamp, trade.total_value
                    );
                    if seen_trade_keys.contains(&trade_key) {
                        continue;
                    }

                    // Check minimum sell value
                    if trade.total_value < cfg.min_sell_value_usd {
                        continue;
                    }

                    // Check blacklist
                    if cfg.blacklisted_coins.iter().any(|b| b.eq_ignore_ascii_case(&trade.coin_symbol)) {
                        continue;
                    }

                    // Check cooldown for this coin
                    if coin_cooldowns.contains_key(&trade.coin_symbol) {
                        debug!("DipBuyer: {} still in cooldown", trade.coin_symbol);
                        continue;
                    }

                    // Check daily budget (use max possible buy amount for conservative check)
                    if cfg.max_daily_spend_usd > 0.0 && spent_today + cfg.buy_amount_usd > cfg.max_daily_spend_usd {
                        debug!("DipBuyer: would exceed daily spend limit for {}", trade.coin_symbol);
                        continue;
                    }

                    // Mark as seen regardless of outcome
                    seen_trade_keys.insert(trade_key);

                    // ─── Analyze the coin ─────────────────────────────────

                    // Get coin details (with chart data for momentum analysis)
                    let coin_data = if cfg.use_momentum_analysis {
                        match client.get_coin_with_chart(&trade.coin_symbol, "1h").await {
                            Ok(d) => d,
                            Err(e) => {
                                debug!("DipBuyer: failed to get coin with chart {}: {}", trade.coin_symbol, e);
                                continue;
                            }
                        }
                    } else {
                        match client.get_coin(&trade.coin_symbol).await {
                            Ok(c) => rugplay_core::CoinDetailsResponse {
                                coin: c,
                                candlestick_data: Vec::new(),
                                volume_data: Vec::new(),
                                timeframe: None,
                            },
                            Err(e) => {
                                debug!("DipBuyer: failed to get coin {}: {}", trade.coin_symbol, e);
                                continue;
                            }
                        }
                    };
                    let coin = &coin_data.coin;

                    // Resolve tier settings (per-tier overrides fall back to globals)
                    let tier = cfg.resolve_tier(coin.market_cap);

                    // Tier-aware sell value re-check (initial check used global as quick pre-filter)
                    if trade.total_value < tier.min_sell_value_usd {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("Sell ${:.0} below tier min ${:.0}", trade.total_value, tier.min_sell_value_usd));
                        continue;
                    }

                    // Hard gate: Volume filter (tier-aware)
                    if coin.volume_24h < tier.min_volume_24h {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("Low volume (${:.0} < ${:.0})", coin.volume_24h, tier.min_volume_24h));
                        continue;
                    }

                    // Hard gate: Market cap filters
                    if coin.market_cap < cfg.min_market_cap {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("Low market cap (${:.0} < ${:.0})", coin.market_cap, cfg.min_market_cap));
                        continue;
                    }
                    if cfg.max_market_cap > 0.0 && coin.market_cap > cfg.max_market_cap {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("High market cap (${:.0} > ${:.0})", coin.market_cap, cfg.max_market_cap));
                        continue;
                    }

                    // Hard gate: 24h change filter
                    if cfg.max_price_drop_pct < 0.0 && coin.change_24h < cfg.max_price_drop_pct {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("Already dropped too much ({:.1}% < {:.1}%)", coin.change_24h, cfg.max_price_drop_pct));
                        continue;
                    }

                    // Fetch holders for analysis
                    let holders = match client.get_coin_holders(&trade.coin_symbol, 20).await {
                        Ok(h) => h,
                        Err(e) => {
                            debug!("DipBuyer: failed to get holders for {}: {}", trade.coin_symbol, e);
                            continue;
                        }
                    };

                    let base_buy_amount = tier.buy_amount_usd;

                    // ─── Portfolio-aware position check ───────────────────
                    if cfg.portfolio_aware && cfg.max_position_pct > 0.0 {
                        match client.get_portfolio().await {
                            Ok(portfolio) => {
                                let total_value = portfolio.total_value;
                                if total_value > 0.0 {
                                    let existing_value = portfolio.coin_holdings.iter()
                                        .find(|h| h.symbol == trade.coin_symbol)
                                        .map(|h| h.value)
                                        .unwrap_or(0.0);
                                    let after_buy = existing_value + base_buy_amount;
                                    let position_pct = (after_buy / total_value) * 100.0;
                                    if position_pct > cfg.max_position_pct {
                                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                                            &format!("Position {:.1}% would exceed max {:.1}%", position_pct, cfg.max_position_pct));
                                        continue;
                                    }
                                }
                            }
                            Err(e) => {
                                debug!("DipBuyer: portfolio check failed for {}: {}", trade.coin_symbol, e);
                            }
                        }
                    }

                    // ─── Run confidence scoring engine ────────────────────
                    let analysis = analyze_dip(
                        &trade.coin_symbol,
                        trade,
                        coin,
                        &coin_data.candlestick_data,
                        &holders,
                        base_buy_amount,
                        &cfg.signal_weights,
                        cfg.skip_top_n_holders,
                        tier.max_buy_slippage_pct,
                    );

                    // Hard rejection from signals (whale dump, extreme concentration, slippage)
                    if analysis.hard_reject {
                        let reason = analysis.reject_reason.as_deref().unwrap_or("Signal hard reject");
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value, reason);
                        continue;
                    }

                    // Confidence threshold check
                    if analysis.confidence_score < cfg.min_confidence_score {
                        emit_skip(&app_handle, &trade.coin_symbol, &trade.username, trade.total_value,
                            &format!("Low confidence {:.2} < {:.2} ({})",
                                analysis.confidence_score, cfg.min_confidence_score,
                                analysis.signals.iter().map(|s| format!("{}:{:.2}", s.name, s.score)).collect::<Vec<_>>().join(", ")
                            ));
                        continue;
                    }

                    // ─── DIP CONFIRMED — BUY ─────────────────────────────

                    dips_detected += 1;

                    // Scale buy amount by confidence if enabled
                    let buy_amount = if cfg.scale_by_confidence {
                        (base_buy_amount * analysis.recommended_buy_pct).max(1.0)
                    } else {
                        base_buy_amount
                    };

                    // Final daily spend check with resolved amount
                    if cfg.max_daily_spend_usd > 0.0 && spent_today + buy_amount > cfg.max_daily_spend_usd {
                        debug!("DipBuyer: resolved buy ${:.0} for {} would exceed daily spend", buy_amount, trade.coin_symbol);
                        continue;
                    }

                    let seller_rank = trade.user_id.parse::<u32>().ok().and_then(|sid| {
                        holders.holders.iter().find(|h| h.user_id == sid).map(|h| h.rank)
                    });

                    info!(
                        "DipBuyer: dip confirmed on {} — confidence {:.2}, slippage {:.2}%, {} sold ${:.2} (rank: {:?}), buy ${:.0}",
                        trade.coin_symbol, analysis.confidence_score, analysis.slippage_pct,
                        trade.username, trade.total_value, seller_rank, buy_amount
                    );
                    for sig in &analysis.signals {
                        debug!("  Signal [{}]: raw={:.3} score={:.3} w={:.2} → {:.3} | {}",
                            sig.name, sig.raw_value, sig.score, sig.weight, sig.weighted, sig.reason);
                    }

                    let event = DipBuyerTriggeredEvent {
                        symbol: trade.coin_symbol.clone(),
                        coin_name: trade.coin_name.clone(),
                        buy_amount_usd: buy_amount,
                        seller_username: trade.username.clone(),
                        sell_value_usd: trade.total_value,
                        seller_rank,
                        market_cap: coin.market_cap,
                        price: coin.current_price,
                        change_24h: coin.change_24h,
                        confidence_score: analysis.confidence_score,
                        slippage_pct: analysis.slippage_pct,
                        sell_impact_pct: analysis.sell_impact_pct,
                    };
                    let _ = app_handle.emit("dipbuyer-triggered", &event);

                    let reason = format!(
                        "DipBuyer: {} sold ${:.0} of {} (conf={:.2}, slip={:.1}%), buy ${:.0}",
                        trade.username, trade.total_value, trade.coin_symbol,
                        analysis.confidence_score, analysis.slippage_pct, buy_amount
                    );

                    match executor.submit_trade(
                        trade.coin_symbol.clone(),
                        TradeType::Buy,
                        buy_amount,
                        TradePriority::Normal,
                        reason,
                    ).await {
                        Ok(response) => {
                            info!("DipBuyer: bought {} @ ${:.8} for ${:.0}", trade.coin_symbol, response.new_price, buy_amount);
                            total_bought += 1;
                            last_bought_at = Some(chrono::Utc::now().to_rfc3339());

                            coin_cooldowns.insert(trade.coin_symbol.clone(), now_epoch);
                            daily_buys.push((now_epoch, buy_amount));

                            if let Some(notif) = app_handle.try_state::<NotificationHandle>() {
                                notif.send_raw(
                                    &format!("Dip Buy: {}", trade.coin_symbol),
                                    &format!(
                                        "${:.2} @ ${:.8} (conf {:.0}%) — {} dumped ${:.0}",
                                        buy_amount, response.new_price,
                                        analysis.confidence_score * 100.0,
                                        trade.username, trade.total_value
                                    ),
                                ).await;
                            }

                            save_dipbuyer_state(&app_handle, total_bought, last_bought_at.as_deref()).await;

                            save_dipbuyer_log_entry(
                                &app_handle,
                                &trade.coin_symbol,
                                &trade.coin_name,
                                buy_amount,
                                &trade.username,
                                trade.total_value,
                                seller_rank,
                                coin.market_cap,
                                response.new_price,
                                coin.change_24h,
                                &analysis,
                            ).await;

                            // Auto-create sentinel
                            if cfg.auto_create_sentinel {
                                create_sentinel_for_dip(
                                    &app_handle,
                                    &trade.coin_symbol,
                                    response.new_price,
                                    &cfg,
                                ).await;
                            }
                        }
                        Err(e) => {
                            error!("DipBuyer: failed to buy {}: {}", trade.coin_symbol, e);
                        }
                    }
                }

                // Prune seen_trade_keys if set grows too large.
                // We keep the set from getting unbounded but can't do LRU with
                // HashSet alone, so we shrink to ~200 by clearing and relying on
                // last_tick_ts for primary dedup on restart.
                if seen_trade_keys.len() > 1000 {
                    seen_trade_keys.clear();
                }

                // Persist the latest trade timestamp so restarts skip already-evaluated trades
                if max_trade_ts > last_tick_ts {
                    save_dipbuyer_last_tick_ts(&app_handle, max_trade_ts).await;
                    last_tick_ts = max_trade_ts;
                }

                let tick = DipBuyerTickEvent {
                    enabled: true,
                    total_bought,
                    last_bought_at: last_bought_at.clone(),
                    trades_scanned,
                    dips_detected,
                };
                let _ = app_handle.emit("dipbuyer-tick", &tick);
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

fn emit_skip(app_handle: &tauri::AppHandle, symbol: &str, seller: &str, sell_value: f64, reason: &str) {
    debug!("DipBuyer: skipping {} — {}", symbol, reason);
    let event = DipBuyerSkippedEvent {
        symbol: symbol.to_string(),
        seller_username: seller.to_string(),
        sell_value_usd: sell_value,
        reason: reason.to_string(),
    };
    let _ = app_handle.emit("dipbuyer-skipped", &event);
}

async fn get_active_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let active_profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No active profile")?;

    let token = state
        .encryptor
        .decrypt(
            &sqlite::get_profile_token(db.pool(), active_profile.id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Profile token not found")?,
        )
        .map_err(|e| e.to_string())?;

    Ok(token)
}

async fn create_sentinel_for_dip(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    fallback_price: f64,
    config: &DipBuyerConfig,
) {
    let state = app_handle.state::<AppState>();

    // Fetch portfolio avg_purchase_price so the sentinel tracks the true
    // weighted average across all buys, not just the latest dip buy price.
    let avg_entry = match get_active_token(app_handle).await {
        Ok(token) => {
            let client = RugplayClient::new(&token);
            match client.get_portfolio().await {
                Ok(portfolio) => {
                    portfolio.coin_holdings.iter()
                        .find(|h| h.symbol == symbol)
                        .map(|h| if h.avg_purchase_price > 0.0 { h.avg_purchase_price } else { fallback_price })
                        .unwrap_or(fallback_price)
                }
                Err(_) => fallback_price,
            }
        }
        Err(_) => fallback_price,
    };

    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let profile = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    // Load sentinel defaults for sell_percentage so we don't override
    // user preferences with a hardcoded 100%.
    let sell_pct = {
        let settings_json: Option<String> = sqlx::query_scalar(
            "SELECT value FROM settings WHERE key = 'app_settings'",
        )
        .fetch_optional(db.pool())
        .await
        .ok()
        .flatten();

        settings_json
            .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
            .and_then(|s| s["sentinelDefaults"]["sellPercentage"].as_f64())
            .unwrap_or(100.0)
    };

    if let Err(e) = sqlite::upsert_sentinel(
        db.pool(),
        profile.id,
        symbol,
        Some(config.stop_loss_pct),
        Some(config.take_profit_pct),
        config.trailing_stop_pct,
        sell_pct,
        avg_entry,
    ).await {
        error!("DipBuyer: failed to upsert sentinel for {}: {}", symbol, e);
    } else {
        debug!("DipBuyer: sentinel upserted for {} (avg entry: {:.8})", symbol, avg_entry);
    }
}

// ─── DB Persistence ──────────────────────────────────────────────────

async fn load_dipbuyer_config(app_handle: &tauri::AppHandle) -> Option<DipBuyerConfig> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    let json: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'dipbuyer_config'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()?;

    serde_json::from_str(&json).ok()
}

async fn load_dipbuyer_total(app_handle: &tauri::AppHandle) -> u32 {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return 0 };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'dipbuyer_total_bought'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0)
}

async fn load_dipbuyer_last_at(app_handle: &tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let db = db_guard.as_ref()?;

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'dipbuyer_last_bought_at'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
}

async fn save_dipbuyer_state(app_handle: &tauri::AppHandle, total: u32, last_at: Option<&str>) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let pool = db.pool();

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('dipbuyer_total_bought', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(total.to_string())
    .execute(pool)
    .await;

    if let Some(at) = last_at {
        let _ = sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('dipbuyer_last_bought_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1",
        )
        .bind(at)
        .execute(pool)
        .await;
    }
}

pub async fn save_dipbuyer_config(app_handle: &tauri::AppHandle, config: &DipBuyerConfig) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let json = serde_json::to_string(config).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('dipbuyer_config', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(&json)
    .execute(db.pool())
    .await;
}

pub async fn save_dipbuyer_enabled(app_handle: &tauri::AppHandle, enabled: bool) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('dipbuyer_enabled', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(if enabled { "true" } else { "false" })
    .execute(db.pool())
    .await;
}

async fn load_dipbuyer_enabled(app_handle: &tauri::AppHandle) -> bool {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return false };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'dipbuyer_enabled'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false)
}

async fn save_dipbuyer_log_entry(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    coin_name: &str,
    buy_amount_usd: f64,
    seller_username: &str,
    sell_value_usd: f64,
    seller_rank: Option<u32>,
    market_cap: f64,
    price: f64,
    change_24h: f64,
    analysis: &DipAnalysis,
) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let profile = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    let signals_json: Vec<serde_json::Value> = analysis.signals.iter().map(|s| {
        serde_json::json!({
            "name": s.name,
            "score": (s.score * 1000.0).round() / 1000.0,
            "weight": s.weight,
            "weighted": (s.weighted * 1000.0).round() / 1000.0,
            "reason": s.reason,
        })
    }).collect();

    let _ = sqlx::query(
        "INSERT INTO automation_log (profile_id, module, symbol, coin_name, action, amount_usd, details) \
         VALUES (?, 'dipbuyer', ?, ?, 'BUY', ?, ?)",
    )
    .bind(profile.id)
    .bind(symbol)
    .bind(coin_name)
    .bind(buy_amount_usd)
    .bind(serde_json::json!({
        "sellerUsername": seller_username,
        "sellValueUsd": sell_value_usd,
        "sellerRank": seller_rank,
        "marketCap": market_cap,
        "price": price,
        "change24h": change_24h,
        "confidenceScore": (analysis.confidence_score * 1000.0).round() / 1000.0,
        "slippagePct": (analysis.slippage_pct * 100.0).round() / 100.0,
        "sellImpactPct": (analysis.sell_impact_pct * 100.0).round() / 100.0,
        "signals": signals_json,
    }).to_string())
    .execute(db.pool())
    .await;

    debug!("DipBuyer log entry saved for {}", symbol);
}

// ─── Restart-Safe State Restoration ──────────────────────────────────

async fn load_dipbuyer_last_tick_ts(app_handle: &tauri::AppHandle) -> i64 {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return 0 };

    sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'dipbuyer_last_tick_ts'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(0)
}

async fn save_dipbuyer_last_tick_ts(app_handle: &tauri::AppHandle, ts: i64) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('dipbuyer_last_tick_ts', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(ts.to_string())
    .execute(db.pool())
    .await;
}

/// Restore coin_cooldowns, daily_buys, and seen_trade_keys from the
/// automation_log table so that app restarts don't cause duplicate purchases.
async fn restore_state_from_log(
    app_handle: &tauri::AppHandle,
    coin_cooldowns: &mut HashMap<String, i64>,
    daily_buys: &mut Vec<(i64, f64)>,
    seen_trade_keys: &mut HashSet<String>,
    last_tick_ts: i64,
) {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else { return };

    let profile = match sqlite::get_active_profile(db.pool()).await {
        Ok(Some(p)) => p,
        _ => return,
    };

    // Load dipbuyer BUY entries from the last 24 hours
    let rows: Vec<(String, f64, String, String)> = sqlx::query_as(
        "SELECT symbol, amount_usd, details, created_at \
         FROM automation_log \
         WHERE profile_id = ? AND module = 'dipbuyer' AND action = 'BUY' \
           AND created_at >= datetime('now', '-1 day') \
         ORDER BY created_at DESC",
    )
    .bind(profile.id)
    .fetch_all(db.pool())
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        info!("DipBuyer: no recent log entries to restore");
        return;
    }

    let _now_epoch = chrono::Utc::now().timestamp();

    for (symbol, amount_usd, details_json, created_at) in &rows {
        // Parse the created_at timestamp to epoch
        let entry_epoch = chrono::NaiveDateTime::parse_from_str(created_at, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| chrono::DateTime::parse_from_rfc3339(created_at).map(|dt| dt.naive_utc()))
            .map(|dt| dt.and_utc().timestamp())
            .unwrap_or(0);

        // Restore daily_buys (all entries are already within 24h from query)
        if entry_epoch > 0 {
            daily_buys.push((entry_epoch, *amount_usd));
        }

        // Restore coin_cooldowns — mark the coin with its buy timestamp
        // The main loop will prune expired ones using cooldown_per_coin_secs
        coin_cooldowns.entry(symbol.clone()).or_insert(entry_epoch);

        // Reconstruct a seen_trade_key from the log details to prevent re-buying
        // on the same triggering sell trade
        if let Ok(details) = serde_json::from_str::<serde_json::Value>(details_json) {
            let seller = details.get("sellerUsername").and_then(|v| v.as_str()).unwrap_or("");
            let sell_val = details.get("sellValueUsd").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if !seller.is_empty() {
                // We don't have the exact userId:symbol:timestamp:value key, so we
                // mark the symbol itself as seen for trades near this timestamp.
                // The last_tick_ts filter handles the primary dedup; this is a safety net.
                let approx_key = format!("restored:{}:{}:{:.4}", symbol, seller, sell_val);
                seen_trade_keys.insert(approx_key);
            }
        }
    }

    info!(
        "DipBuyer: restored {} cooldowns, {} daily buys, last_tick_ts={} from automation_log",
        coin_cooldowns.len(),
        daily_buys.len(),
        last_tick_ts,
    );
}
