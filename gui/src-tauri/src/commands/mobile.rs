//! Tauri commands for the Mobile Access server (Phase 6)

use crate::mobile_server::{ConnectionMode, MobileServerHandle, MobileServerStatus, SessionRole};
use crate::AppState;
use tauri::{Manager, State};
use tracing::info;

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

#[tauri::command]
pub async fn stop_mobile_server(
    handle: State<'_, MobileServerHandle>,
) -> Result<(), String> {
    info!("Stopping mobile server");
    handle.stop().await
}

#[tauri::command]
pub async fn get_mobile_server_status(
    handle: State<'_, MobileServerHandle>,
) -> Result<MobileServerStatus, String> {
    Ok(handle.get_status().await)
}

#[tauri::command]
pub async fn regenerate_mobile_pin(
    handle: State<'_, MobileServerHandle>,
) -> Result<String, String> {
    info!("Regenerating mobile access PIN");
    handle.regenerate_pin().await
}

#[tauri::command]
pub async fn set_mobile_default_role(
    handle: State<'_, MobileServerHandle>,
    role: String,
) -> Result<String, String> {
    let role = match role.to_lowercase().as_str() {
        "viewer" => SessionRole::Viewer,
        "trusted" => SessionRole::Trusted,
        "admin" => SessionRole::Admin,
        _ => return Err(format!("Invalid role: {}", role)),
    };
    info!("Mobile default role set to: {}", role);
    handle.set_default_role(role).await?;
    Ok(format!("{}", role))
}

#[tauri::command]
pub async fn kick_mobile_session(
    handle: State<'_, MobileServerHandle>,
    token_prefix: String,
) -> Result<(), String> {
    info!("Kicking mobile session: {}", token_prefix);
    handle.kick_session(&token_prefix).await
}

#[tauri::command]
pub async fn set_mobile_session_role(
    handle: State<'_, MobileServerHandle>,
    token_prefix: String,
    role: String,
) -> Result<(), String> {
    let role = match role.to_lowercase().as_str() {
        "viewer" => SessionRole::Viewer,
        "trusted" => SessionRole::Trusted,
        "admin" => SessionRole::Admin,
        _ => return Err(format!("Invalid role: {}", role)),
    };
    info!("Setting session {} role to {}", token_prefix, role);
    handle.set_session_role(&token_prefix, role).await
}
