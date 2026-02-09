//! Tauri commands for notification configuration

use crate::notifications::{NotificationConfig, NotificationHandle};
use tauri::Manager;

/// Get current notification configuration
#[tauri::command]
pub async fn get_notification_config(
    app_handle: tauri::AppHandle,
) -> Result<NotificationConfig, String> {
    let handle = app_handle.state::<NotificationHandle>();
    Ok(handle.get_config().await)
}

/// Update notification configuration
#[tauri::command]
pub async fn set_notification_config(
    app_handle: tauri::AppHandle,
    config: NotificationConfig,
) -> Result<(), String> {
    let handle = app_handle.state::<NotificationHandle>();
    handle.set_config(config.clone()).await;

    // Persist to DB
    crate::notifications::save_notification_config(&app_handle, &config).await;

    Ok(())
}
