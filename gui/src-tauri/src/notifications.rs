//! Centralized notification system
//!
//! Provides native Windows toast notifications for all automated events
//! (sentinel triggers, sniper buys, harvester claims, risk alerts).
//! Uses tauri-plugin-notification under the hood.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::RwLock;
use tracing::{debug, warn};

// ─── Config ──────────────────────────────────────────────────────────

/// Per-category notification toggles
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationConfig {
    /// Master switch — if false, no notifications at all
    pub enabled: bool,
    /// Sentinel SL/TP/TS triggers
    pub sentinel_triggers: bool,
    /// Sniper buy events
    pub sniper_buys: bool,
    /// Harvester reward claims
    pub harvester_claims: bool,
    /// Risk limit rejections
    pub risk_alerts: bool,
    /// Session / auth errors
    pub session_alerts: bool,
    /// Trade execution confirmations (manual)
    pub trade_confirmations: bool,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            sentinel_triggers: true,
            sniper_buys: true,
            harvester_claims: true,
            risk_alerts: true,
            session_alerts: true,
            trade_confirmations: false, // off by default — too noisy
        }
    }
}

// ─── Handle ──────────────────────────────────────────────────────────

/// Shared handle for sending notifications from anywhere in the app
#[derive(Clone)]
pub struct NotificationHandle {
    app: AppHandle,
    config: Arc<RwLock<NotificationConfig>>,
}

impl NotificationHandle {
    /// Create a new notification handle
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            config: Arc::new(RwLock::new(NotificationConfig::default())),
        }
    }

    /// Update the notification configuration
    pub async fn set_config(&self, config: NotificationConfig) {
        *self.config.write().await = config;
    }

    /// Get the current notification configuration
    pub async fn get_config(&self) -> NotificationConfig {
        self.config.read().await.clone()
    }

    // ─── Sentinel Notifications ──────────────────────────────────

    /// Notify when a stop-loss triggers
    pub async fn notify_stop_loss(&self, symbol: &str, loss_pct: f64, price: f64) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.sentinel_triggers {
            return;
        }
        drop(cfg);

        self.send(
            "🛑 Stop Loss Triggered",
            &format!(
                "${} sold at {:.1}% loss (price: ${:.8})",
                symbol,
                loss_pct.abs(),
                price
            ),
        );
    }

    /// Notify when a take-profit triggers
    pub async fn notify_take_profit(&self, symbol: &str, gain_pct: f64, price: f64) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.sentinel_triggers {
            return;
        }
        drop(cfg);

        self.send(
            "🎯 Take Profit Triggered",
            &format!(
                "${} sold at +{:.1}% profit (price: ${:.8})",
                symbol, gain_pct, price
            ),
        );
    }

    /// Notify when a trailing stop triggers
    pub async fn notify_trailing_stop(&self, symbol: &str, drop_pct: f64, price: f64) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.sentinel_triggers {
            return;
        }
        drop(cfg);

        self.send(
            "📉 Trailing Stop Triggered",
            &format!(
                "${} sold after {:.1}% drop from peak (price: ${:.8})",
                symbol, drop_pct, price
            ),
        );
    }

    // ─── Sniper Notifications ────────────────────────────────────

    /// Notify when the sniper buys a new coin
    pub async fn notify_sniper_buy(&self, symbol: &str, amount_usd: f64, price: f64) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.sniper_buys {
            return;
        }
        drop(cfg);

        self.send(
            "🎯 Sniper Buy",
            &format!(
                "Bought ${} for ${:.2} (price: ${:.8})",
                symbol, amount_usd, price
            ),
        );
    }

    // ─── Harvester Notifications ─────────────────────────────────

    /// Notify when a daily reward is claimed
    pub async fn notify_harvester_claimed(&self, reward_amount: f64, username: &str, streak: u32) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.harvester_claims {
            return;
        }
        drop(cfg);

        self.send(
            "🌾 Reward Claimed",
            &format!(
                "{}: ${:.2} claimed (streak: {} days)",
                username, reward_amount, streak
            ),
        );
    }

    // ─── Risk Notifications ──────────────────────────────────────

    /// Notify when a trade is rejected by risk limits
    pub async fn notify_risk_rejected(&self, symbol: &str, reason: &str) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.risk_alerts {
            return;
        }
        drop(cfg);

        self.send(
            "⚠️ Risk Limit Hit",
            &format!("${} trade rejected: {}", symbol, reason),
        );
    }

    // ─── Session Notifications ───────────────────────────────────

    /// Notify when the session token expires
    pub async fn notify_session_expired(&self) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.session_alerts {
            return;
        }
        drop(cfg);

        self.send(
            "🔑 Session Expired",
            "Your token has expired — please re-authenticate",
        );
    }

    // ─── Trade Confirmations ─────────────────────────────────────

    /// Notify on successful trade execution
    pub async fn notify_trade_executed(&self, symbol: &str, trade_type: &str, amount: f64) {
        let cfg = self.config.read().await;
        if !cfg.enabled || !cfg.trade_confirmations {
            return;
        }
        drop(cfg);

        self.send(
            &format!("💰 {} Executed", trade_type),
            &format!("${} — {} ${:.2}", symbol, trade_type, amount),
        );
    }

    // ─── Internal ────────────────────────────────────────────────

    /// Send a native notification
    fn send(&self, title: &str, body: &str) {
        debug!("Notification: {} — {}", title, body);

        if let Err(e) = self
            .app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
        {
            warn!("Failed to send notification: {}", e);
        }
    }
}

// ─── DB Persistence ──────────────────────────────────────────────────

/// Load notification config from the settings table
pub async fn load_notification_config(app_handle: &AppHandle) -> NotificationConfig {
    use crate::AppState;
    use tauri::Manager;

    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;

    let Some(db) = db_guard.as_ref() else {
        return NotificationConfig::default();
    };

    let json: Option<String> = sqlx::query_scalar::<sqlx::Sqlite, String>(
        "SELECT value FROM settings WHERE key = 'notification_config'",
    )
    .fetch_optional(db.pool())
    .await
    .ok()
    .flatten();

    json.and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default()
}

/// Save notification config to the settings table
pub async fn save_notification_config(app_handle: &AppHandle, config: &NotificationConfig) {
    use crate::AppState;
    use tauri::Manager;

    let state = app_handle.state::<AppState>();
    let db_guard = state.db.read().await;

    let Some(db) = db_guard.as_ref() else {
        return;
    };

    let json = serde_json::to_string(config).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('notification_config', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(&json)
    .execute(db.pool())
    .await;
}
