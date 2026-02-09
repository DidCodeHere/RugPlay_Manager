//! Tauri commands for the Mobile Access server (Phase 6)

use crate::mobile_server::{ConnectionMode, MobileServerHandle, MobileServerStatus};
use crate::AppState;
use tauri::{Manager, State};
use tracing::info;

/// Start the mobile access server
#[tauri::command]
pub async fn start_mobile_server(
    app_handle: tauri::AppHandle,
    handle: State<'_, MobileServerHandle>,
    mode: String,
    port: Option<u16>,
) -> Result<MobileServerStatus, String> {
    let state = app_handle.state::<AppState>();
    let connection_mode = match mode.as_str() {
        "local" | "localWifi" => ConnectionMode::LocalWifi,
        _ => ConnectionMode::Internet,
    };
    let port = port.unwrap_or(9876);

    info!("Starting mobile server in {:?} mode on port {}", connection_mode, port);

    handle
        .start(state.inner().clone(), app_handle.clone(), connection_mode, port)
        .await
}

/// Stop the mobile access server
#[tauri::command]
pub async fn stop_mobile_server(
    handle: State<'_, MobileServerHandle>,
) -> Result<(), String> {
    info!("Stopping mobile server");
    handle.stop().await
}

/// Get the current mobile server status
#[tauri::command]
pub async fn get_mobile_server_status(
    handle: State<'_, MobileServerHandle>,
) -> Result<MobileServerStatus, String> {
    Ok(handle.get_status().await)
}

/// Regenerate the PIN (forces re-auth on all connected devices)
#[tauri::command]
pub async fn regenerate_mobile_pin(
    handle: State<'_, MobileServerHandle>,
) -> Result<String, String> {
    info!("Regenerating mobile access PIN");
    handle.regenerate_pin().await
}

/// Enable or disable remote control (trading) from mobile
#[tauri::command]
pub async fn set_mobile_control_enabled(
    handle: State<'_, MobileServerHandle>,
    enabled: bool,
) -> Result<bool, String> {
    info!("Mobile remote control set to: {}", enabled);
    handle.set_control_enabled(enabled).await
}
