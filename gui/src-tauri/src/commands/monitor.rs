//! Sentinel Monitor control commands (start/stop/pause/resume/status)

use crate::sentinel_loop::{MonitorStatus, SentinelMonitorHandle};
use serde::Serialize;
use tauri::State;
use tracing::{debug, info};

/// Status response for the sentinel monitor
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorStatusResponse {
    pub status: MonitorStatus,
    pub interval_secs: u64,
    pub is_paused: bool,
}

/// Get sentinel monitor status
#[tauri::command]
pub async fn get_sentinel_monitor_status(
    handle: State<'_, SentinelMonitorHandle>,
) -> Result<MonitorStatusResponse, String> {
    debug!("Getting sentinel monitor status");

    let status = handle.status().await;
    let interval_secs = handle.get_interval().await;
    let is_paused = handle.is_paused().await;

    Ok(MonitorStatusResponse {
        status,
        interval_secs,
        is_paused,
    })
}

/// Pause the sentinel monitor
#[tauri::command]
pub async fn pause_sentinel_monitor(
    handle: State<'_, SentinelMonitorHandle>,
) -> Result<(), String> {
    info!("Pausing sentinel monitor");
    handle.pause().await;
    Ok(())
}

/// Resume the sentinel monitor
#[tauri::command]
pub async fn resume_sentinel_monitor(
    handle: State<'_, SentinelMonitorHandle>,
) -> Result<(), String> {
    info!("Resuming sentinel monitor");
    handle.resume().await;
    Ok(())
}

/// Set sentinel monitor polling interval
#[tauri::command]
pub async fn set_sentinel_monitor_interval(
    interval_secs: u64,
    handle: State<'_, SentinelMonitorHandle>,
) -> Result<(), String> {
    if interval_secs < 5 {
        return Err("Interval must be at least 5 seconds".to_string());
    }
    if interval_secs > 300 {
        return Err("Interval must be at most 300 seconds".to_string());
    }

    info!("Setting sentinel monitor interval to {}s", interval_secs);
    handle.set_interval(interval_secs).await;
    Ok(())
}
