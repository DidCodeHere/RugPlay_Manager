//! Rugplay GUI - Tauri application library

pub mod commands;
pub mod dipbuyer;
pub mod dipbuyer_signals;
pub mod harvester;
pub mod mirror;
pub mod mobile_server;
pub mod notifications;
pub mod sentinel_loop;
pub mod sniper;
pub mod trade_executor;
mod state;

pub use dipbuyer::DipBuyerHandle;
pub use harvester::HarvesterHandle;
pub use mirror::MirrorHandle;
pub use mobile_server::MobileServerHandle;
pub use notifications::NotificationHandle;
pub use sentinel_loop::SentinelMonitorHandle;
pub use sniper::SniperHandle;
pub use state::AppState;
pub use state::save_automation_log;
pub use trade_executor::TradeExecutorHandle;
