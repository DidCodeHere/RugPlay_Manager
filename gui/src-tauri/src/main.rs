//! Rugplay GUI - Main entry point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rugplay_gui_lib::{commands, AppState};
use rugplay_gui_lib::harvester::spawn_harvester;
use rugplay_gui_lib::mirror::spawn_mirror;
use rugplay_gui_lib::mobile_server::MobileServerHandle;
use rugplay_gui_lib::notifications::{NotificationHandle, load_notification_config};
use rugplay_gui_lib::trade_executor::spawn_trade_executor;
use rugplay_gui_lib::sentinel_loop::spawn_sentinel_monitor;
use rugplay_gui_lib::sniper::spawn_sniper;
use rugplay_persistence::TokenEncryptor;
use std::path::PathBuf;
use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

fn main() {
    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rugplay_gui=debug,rugplay_core=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting RugPlay Manager");

    // Get data directory
    let data_dir = dirs_next::data_local_dir()
        .map(|p| p.join("RugplayBot"))
        .unwrap_or_else(|| PathBuf::from("."));

    // Derive encryption key from machine fingerprint (Argon2id + machine-uid)
    let encryption_key = match rugplay_persistence::derive_machine_key() {
        Ok(key) => key,
        Err(e) => {
            eprintln!("FATAL: Failed to derive machine encryption key: {}", e);
            eprintln!("This may happen if the machine-uid cannot be determined.");
            std::process::exit(1);
        }
    };

    tracing::info!("Encryption key derived from machine fingerprint");

    // Create application state
    let app_state = match AppState::new(data_dir, &encryption_key) {
        Ok(state) => state,
        Err(e) => {
            eprintln!("FATAL: Failed to create application state: {}", e);
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state)
        .setup(|app| {
            let state = app.state::<AppState>();
            let state_clone = state.inner().clone();
            let app_handle = app.handle().clone();
            
            // Initialize database in async context, then spawn background tasks
            tauri::async_runtime::spawn(async move {
                if let Err(e) = state_clone.init_db().await {
                    tracing::error!("Failed to initialize database: {}", e);
                    return;
                }

                tracing::info!("Database initialized, running encryption migration");

                // Migrate tokens encrypted with legacy key [0u8; 32] to new machine-bound key
                migrate_encryption_keys(&state_clone).await;

                tracing::info!("Spawning background tasks");

                // Initialize notification system
                let notif_handle = NotificationHandle::new(app_handle.clone());
                let saved_notif_config = load_notification_config(&app_handle).await;
                notif_handle.set_config(saved_notif_config).await;
                app_handle.manage(notif_handle);

                // Spawn trade executor (centralized trade queue with rate limiting)
                let executor_handle = spawn_trade_executor(app_handle.clone());

                // Load persisted risk limits
                if let Some(limits) = commands::risk::load_risk_limits_from_db(&app_handle).await {
                    executor_handle.set_risk_limits(limits).await;
                    tracing::info!("Risk limits loaded from DB");
                }

                app_handle.manage(executor_handle.clone());

                // Spawn sentinel monitor (background SL/TP/TS checking loop)
                let monitor_handle = spawn_sentinel_monitor(app_handle.clone(), executor_handle.clone());
                app_handle.manage(monitor_handle);

                // Spawn harvester (12h auto-claim loop)
                let harvester_handle = spawn_harvester(app_handle.clone());
                app_handle.manage(harvester_handle);

                // Spawn sniper (auto-buy new coins loop)
                let sniper_handle = spawn_sniper(app_handle.clone(), executor_handle.clone());
                app_handle.manage(sniper_handle);

                // Spawn mirror (whale copy-trading loop)
                let mirror_handle = spawn_mirror(app_handle.clone(), executor_handle);
                app_handle.manage(mirror_handle);

                // Initialize mobile server handle (server starts on user request)
                let mobile_handle = MobileServerHandle::new();
                app_handle.manage(mobile_handle);

                tracing::info!("Background tasks spawned successfully");
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::list_profiles,
            commands::add_profile,
            commands::select_profile,
            commands::update_profile_token,
            commands::delete_profile,
            commands::logout,
            commands::get_active_profile,
            // Portfolio commands
            commands::get_portfolio,
            commands::get_portfolio_summary,
            commands::get_market,
            commands::get_coin_details,
            commands::get_coin_with_chart,
            commands::get_coin_holders,
            commands::get_recent_trades,
            // Trading commands
            commands::execute_trade,
            commands::get_balance,
            // Sentinel commands
            commands::create_sentinel,
            commands::list_sentinels,
            commands::toggle_sentinel,
            commands::delete_sentinel,
            commands::update_sentinel_price,
            commands::update_sentinel,
            commands::run_sentinel_check,
            commands::sync_sentinels,
            commands::update_all_sentinels,
            commands::toggle_all_sentinels,
            // Sentinel monitor commands
            commands::get_sentinel_monitor_status,
            commands::pause_sentinel_monitor,
            commands::resume_sentinel_monitor,
            commands::set_sentinel_monitor_interval,
            // Harvester commands
            commands::get_harvester_status,
            commands::set_harvester_enabled,
            commands::force_claim_reward,
            // Sniper commands
            commands::get_sniper_status,
            commands::set_sniper_enabled,
            commands::update_sniper_config,
            commands::clear_sniped_symbols_cmd,
            commands::clear_coin_cache,
            // Mirror commands
            commands::get_mirror_status,
            commands::set_mirror_enabled,
            commands::update_mirror_config,
            commands::add_tracked_whale,
            commands::remove_tracked_whale,
            commands::list_tracked_whales,
            commands::get_whale_profile,
            commands::get_mirror_trades,
            // Risk limit commands
            commands::get_risk_limits,
            commands::set_risk_limits,
            // Notification commands
            commands::get_notification_config,
            commands::set_notification_config,
            // App settings commands
            commands::get_app_settings,
            commands::set_app_settings,
            // Transaction history commands
            commands::get_transactions,
            commands::get_traded_symbols,
            commands::log_transaction,
            // Mobile access commands
            commands::start_mobile_server,
            commands::stop_mobile_server,
            commands::get_mobile_server_status,
            commands::regenerate_mobile_pin,
            commands::set_mobile_control_enabled,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Shutdown mobile server when app exits
                let handle = app_handle.try_state::<MobileServerHandle>();
                if let Some(handle) = handle {
                    let handle = handle.inner().clone();
                    tauri::async_runtime::block_on(async {
                        let _ = handle.stop().await;
                        tracing::info!("Mobile server stopped on app exit");
                    });
                }
            }
        });
}

/// Migrate profile tokens from the legacy `[0u8; 32]` encryption key
/// to the current machine-bound key derived via Argon2id.
///
/// Runs once at startup. For each profile:
/// 1. Try decrypting with the current (new) key — if it works, no migration needed.
/// 2. If that fails, try decrypting with the legacy key.
/// 3. If the legacy key works, re-encrypt with the new key and save back.
async fn migrate_encryption_keys(state: &AppState) {
    use rugplay_persistence::sqlite;

    let db_guard = state.db.read().await;
    let Some(db) = db_guard.as_ref() else {
        tracing::warn!("DB not ready during migration — skipping");
        return;
    };

    let profiles = match sqlite::list_profiles(db.pool()).await {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Failed to list profiles for migration: {}", e);
            return;
        }
    };

    if profiles.is_empty() {
        tracing::debug!("No profiles to migrate");
        return;
    }

    // Build a legacy encryptor with the old [0u8; 32] key
    let legacy_encryptor = match TokenEncryptor::new(&rugplay_persistence::LEGACY_KEY) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to create legacy encryptor: {}", e);
            return;
        }
    };

    for profile in &profiles {
        let encrypted = match sqlite::get_profile_token(db.pool(), profile.id).await {
            Ok(Some(enc)) => enc,
            Ok(None) => continue,
            Err(e) => {
                tracing::warn!("Could not read token for profile {}: {}", profile.id, e);
                continue;
            }
        };

        // Try current key first
        if state.encryptor.decrypt(&encrypted).is_ok() {
            tracing::debug!("Profile {} already uses current key", profile.id);
            continue;
        }

        // Try legacy key
        match legacy_encryptor.decrypt(&encrypted) {
            Ok(plaintext) => {
                tracing::info!(
                    "Profile {} ({}): migrating from legacy key to machine key",
                    profile.id,
                    profile.username
                );

                // Re-encrypt with the new key
                match state.encryptor.encrypt(&plaintext) {
                    Ok(new_encrypted) => {
                        if let Err(e) = sqlite::update_profile_token(
                            db.pool(),
                            profile.id,
                            &new_encrypted,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to save migrated token for profile {}: {}",
                                profile.id,
                                e
                            );
                        } else {
                            tracing::info!(
                                "Profile {} migrated successfully",
                                profile.id
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            "Failed to re-encrypt token for profile {}: {}",
                            profile.id,
                            e
                        );
                    }
                }
            }
            Err(_) => {
                tracing::warn!(
                    "Profile {} token cannot be decrypted with either key — token may be corrupt or from another machine",
                    profile.id
                );
            }
        }
    }
}