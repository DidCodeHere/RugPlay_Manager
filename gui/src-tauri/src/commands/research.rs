use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

/// Research-backed defaults and statistics from the analysis pipeline.
/// This is the single source of truth for:
///   - "Revert to Defaults" on Settings and DipBuyer pages
///   - The future About/Research page infographics
///
/// Data flows: deep_analysis.py → research_manifest.json → this module → frontend

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchManifest {
    #[serde(rename = "_version")]
    pub version: String,
    #[serde(rename = "_generated")]
    pub generated: String,
    pub about: AboutStats,
    pub top_coins: Vec<TopCoin>,
    pub sentinel: SentinelResearch,
    pub dipbuyer: DipBuyerResearch,
    #[serde(default)]
    pub mcap_tiers: serde_json::Value,
    #[serde(default)]
    pub hold_analysis: serde_json::Value,
    #[serde(default)]
    pub grid_aggregate: serde_json::Value,
    #[serde(default)]
    pub tier_summary: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutStats {
    pub total_coins_analyzed: u32,
    pub total_coins_skipped: u32,
    pub total_candle_rows: u64,
    pub grid_configs_tested_per_coin: u32,
    pub total_grid_backtests: u64,
    #[serde(default)]
    pub tier_counts: serde_json::Value,
    #[serde(default)]
    pub mcap_tier_counts: serde_json::Value,
    pub overall_median_return: f64,
    pub overall_median_drawdown: f64,
    pub pump_dump_percentage: f64,
    pub coins_with_positive_sortino: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopCoin {
    pub symbol: String,
    pub tier: String,
    pub mcap_tier: String,
    pub market_cap: f64,
    pub candles: u32,
    pub total_return: f64,
    pub max_drawdown: f64,
    pub best_sl: Option<f64>,
    pub best_tp: Option<f64>,
    pub best_ts: Option<f64>,
    pub sortino: f64,
    pub win_rate: f64,
    pub median_pnl: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelResearch {
    pub overall: SentinelOverallConfigs,
    pub per_tier: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentinelOverallConfigs {
    pub by_sortino: ResearchSentinelConfig,
    pub by_median_pnl: ResearchSentinelConfig,
    pub balanced: ResearchSentinelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSentinelConfig {
    pub stop_loss_pct: f64,
    pub take_profit_pct: f64,
    pub trailing_stop_pct: Option<f64>,
    pub sell_percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DipBuyerResearch {
    pub presets: serde_json::Value,
    pub per_tier: serde_json::Value,
}

/// Hardcoded fallback manifest embedded at compile time.
/// Updated each release cycle after running deep_analysis.py.
fn builtin_manifest() -> ResearchManifest {
    ResearchManifest {
        version: "2026.02.11".into(),
        generated: "2026-02-11 02:43".into(),
        about: AboutStats {
            total_coins_analyzed: 875,
            total_coins_skipped: 187,
            total_candle_rows: 92_873,
            grid_configs_tested_per_coin: 216,
            total_grid_backtests: 189_000,
            tier_counts: serde_json::json!({
                "bluechip": 34, "mid": 72, "micro": 694, "fresh": 75
            }),
            mcap_tier_counts: serde_json::json!({
                "mega": 104, "large": 72, "medium": 137, "small": 561
            }),
            overall_median_return: 522.0,
            overall_median_drawdown: -98.5,
            pump_dump_percentage: 34.7,
            coins_with_positive_sortino: 133,
        },
        top_coins: vec![],
        sentinel: SentinelResearch {
            overall: SentinelOverallConfigs {
                by_sortino: ResearchSentinelConfig {
                    stop_loss_pct: -50.0,
                    take_profit_pct: 1000.0,
                    trailing_stop_pct: None,
                    sell_percentage: 100.0,
                },
                by_median_pnl: ResearchSentinelConfig {
                    stop_loss_pct: -5.0,
                    take_profit_pct: 1000.0,
                    trailing_stop_pct: None,
                    sell_percentage: 100.0,
                },
                balanced: ResearchSentinelConfig {
                    stop_loss_pct: -30.0,
                    take_profit_pct: 500.0,
                    trailing_stop_pct: None,
                    sell_percentage: 100.0,
                },
            },
            per_tier: serde_json::json!({
                "bluechip": {
                    "stopLossPct": -50, "takeProfitPct": 1000,
                    "trailingStopPct": null, "sellPercentage": 100
                },
                "mid": {
                    "stopLossPct": -50, "takeProfitPct": 1000,
                    "trailingStopPct": null, "sellPercentage": 100
                },
                "micro": {
                    "stopLossPct": -5, "takeProfitPct": 25,
                    "trailingStopPct": null, "sellPercentage": 100
                },
                "fresh": {
                    "stopLossPct": -10, "takeProfitPct": 25,
                    "trailingStopPct": 5, "sellPercentage": 100
                }
            }),
        },
        dipbuyer: DipBuyerResearch {
            presets: serde_json::json!({
                "conservative": {
                    "buyAmountUsd": 500, "maxPriceDropPct": -5,
                    "stopLossPct": -10, "takeProfitPct": 200,
                    "trailingStopPct": null, "minMarketCap": 100000,
                    "minVolume24h": 10000, "minConfidenceScore": 0.65,
                    "maxDailyBuys": 5
                },
                "moderate": {
                    "buyAmountUsd": 1000, "maxPriceDropPct": -5,
                    "stopLossPct": -10, "takeProfitPct": 200,
                    "trailingStopPct": null, "minMarketCap": 20000,
                    "minVolume24h": 5000, "minConfidenceScore": 0.55,
                    "maxDailyBuys": 10
                },
                "aggressive": {
                    "buyAmountUsd": 2000, "maxPriceDropPct": -10,
                    "stopLossPct": -20, "takeProfitPct": 200,
                    "trailingStopPct": null, "minMarketCap": 10000,
                    "minVolume24h": 2000, "minConfidenceScore": 0.45,
                    "maxDailyBuys": 20
                }
            }),
            per_tier: serde_json::json!({
                "bluechip": {
                    "maxPriceDropPct": -5, "takeProfitPct": 200, "stopLossPct": -10
                },
                "mid": {
                    "maxPriceDropPct": -5, "takeProfitPct": 200, "stopLossPct": -10
                }
            }),
        },
        mcap_tiers: serde_json::json!({}),
        hold_analysis: serde_json::json!({}),
        grid_aggregate: serde_json::json!({}),
        tier_summary: serde_json::json!({
            "bluechip": {"count": 34, "medianReturn": 28153525.66, "medianDrawdown": -98.52},
            "mid": {"count": 72, "medianReturn": 13640.11, "medianDrawdown": -99.42},
            "micro": {"count": 694, "medianReturn": 476.03, "medianDrawdown": -98.14},
            "fresh": {"count": 75, "medianReturn": 81.44, "medianDrawdown": -99.58}
        }),
    }
}

/// Try to load a newer manifest from disk (placed by the analysis pipeline).
fn try_load_manifest_from_disk(data_dir: &std::path::Path) -> Option<ResearchManifest> {
    let manifest_path = data_dir.join("research_manifest.json");
    if !manifest_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&manifest_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Get the research manifest — prefers disk version over builtin.
#[tauri::command]
pub async fn get_research_manifest(
    state: State<'_, AppState>,
) -> Result<ResearchManifest, String> {
    if let Some(disk_manifest) = try_load_manifest_from_disk(&state.data_dir) {
        return Ok(disk_manifest);
    }
    Ok(builtin_manifest())
}

/// Get just the sentinel research defaults (for "Revert to Defaults" button).
#[tauri::command]
pub async fn get_research_sentinel_defaults(
    state: State<'_, AppState>,
) -> Result<ResearchSentinelConfig, String> {
    let manifest = if let Some(m) = try_load_manifest_from_disk(&state.data_dir) {
        m
    } else {
        builtin_manifest()
    };
    Ok(manifest.sentinel.overall.balanced)
}

/// Get the dipbuyer research presets (for "Revert to Defaults" button).
#[tauri::command]
pub async fn get_research_dipbuyer_defaults(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let manifest = if let Some(m) = try_load_manifest_from_disk(&state.data_dir) {
        m
    } else {
        builtin_manifest()
    };
    Ok(manifest.dipbuyer.presets)
}

/// Get about page statistics.
#[tauri::command]
pub async fn get_research_about_stats(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let manifest = if let Some(m) = try_load_manifest_from_disk(&state.data_dir) {
        m
    } else {
        builtin_manifest()
    };

    let about = serde_json::to_value(&manifest.about).map_err(|e| e.to_string())?;
    let top_coins = serde_json::to_value(&manifest.top_coins).map_err(|e| e.to_string())?;
    let tier_summary = manifest.tier_summary;
    let mcap_tiers = manifest.mcap_tiers;
    let hold_analysis = manifest.hold_analysis;
    let grid_aggregate = manifest.grid_aggregate;

    Ok(serde_json::json!({
        "version": manifest.version,
        "generated": manifest.generated,
        "about": about,
        "topCoins": top_coins,
        "tierSummary": tier_summary,
        "mcapTiers": mcap_tiers,
        "holdAnalysis": hold_analysis,
        "gridAggregate": grid_aggregate,
    }))
}

/// Serve bundled documentation files (embedded at compile time).
#[tauri::command]
pub async fn get_doc_content(slug: String) -> Result<String, String> {
    match slug.as_str() {
        "features" => Ok(include_str!("../../../../docs/FEATURES.md").to_string()),
        "architecture" => Ok(include_str!("../../../../docs/ARCHITECTURE.md").to_string()),
        "installation" => Ok(include_str!("../../../../docs/INSTALLATION.md").to_string()),
        "building" => Ok(include_str!("../../../../docs/BUILDING.md").to_string()),
        "security" => Ok(include_str!("../../../../docs/SECURITY.md").to_string()),
        "readme" => Ok(include_str!("../../../../README.md").to_string()),
        "changelog" => Ok(include_str!("../../../../CHANGELOG.md").to_string()),
        "contributing" => Ok(include_str!("../../../../CONTRIBUTING.md").to_string()),
        _ => Err(format!("Unknown doc: {slug}")),
    }
}
