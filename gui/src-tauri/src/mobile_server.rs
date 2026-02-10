//! Phase 6: Embedded mobile access server
//!
//! Provides a lightweight axum HTTP server that serves a mobile-friendly dashboard
//! and REST API, allowing users to view/control the app from any phone browser.
//!
//! Supports two connection modes:
//! - **Internet**: Uses Cloudflare Quick Tunnel (trycloudflare.com) — accessible
//!   from anywhere, HTTPS, no account required, no firewall config needed
//! - **Local WiFi**: Binds to LAN IP — accessible only from same WiFi network

use crate::AppState;
use axum::{
    extract::{Json, Query, State as AxumState},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use rugplay_core::{PortfolioResponse, PortfolioSummary, RecentTrade, TradeType};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use tokio::sync::{watch, RwLock};
use tracing::{error, info, warn};

/// Default port for the mobile server
const DEFAULT_PORT: u16 = 9876;

/// Max concurrent sessions
const MAX_SESSIONS: usize = 3;

// ─── Server State ───────────────────────────────────────────────────

/// Connection mode for the mobile server
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionMode {
    /// Internet access via bore tunnel (bore.pub)
    Internet,
    /// Local WiFi only (LAN IP)
    LocalWifi,
}

/// Access role for a mobile session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionRole {
    /// View-only: portfolio, module statuses
    Viewer,
    /// View + sentinels, sniper, activity log
    Trusted,
    /// Full control: buy/sell, all data
    Admin,
}

impl std::fmt::Display for SessionRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionRole::Viewer => write!(f, "Viewer"),
            SessionRole::Trusted => write!(f, "Trusted"),
            SessionRole::Admin => write!(f, "Admin"),
        }
    }
}

/// Data stored per active session
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub role: SessionRole,
    pub label: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

/// Shared state for the mobile server
#[derive(Clone)]
pub struct MobileServerState {
    /// Reference to the main app state (DB, encryptor, cache)
    pub app_state: AppState,
    /// The 6-digit PIN required for auth
    pub pin: Arc<RwLock<String>>,
    /// Active session tokens (token -> session data)
    pub sessions: Arc<RwLock<HashMap<String, SessionData>>>,
    /// Failed PIN attempts per IP
    pub failed_attempts: Arc<RwLock<HashMap<String, (u32, chrono::DateTime<chrono::Utc>)>>>,
    /// Default role assigned to new sessions
    pub default_role: Arc<RwLock<SessionRole>>,
    /// Tauri app handle for accessing managed state
    pub app_handle: Option<tauri::AppHandle>,
}

/// Status info returned to the desktop UI
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileServerStatus {
    pub running: bool,
    pub mode: ConnectionMode,
    pub url: Option<String>,
    pub pin: String,
    pub connected_clients: usize,
    pub default_role: SessionRole,
    pub qr_svg: Option<String>,
    pub port: u16,
    pub sessions: Vec<SessionInfo>,
}

/// Information about a single connected session
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub token_prefix: String,
    pub role: SessionRole,
    pub label: String,
    pub connected_at: String,
    pub connected_duration: String,
}

/// Event emitted to the desktop when a mobile device connects
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileConnectionEvent {
    pub event_type: String,
    pub token_prefix: String,
    pub role: SessionRole,
    pub label: String,
    pub total_sessions: usize,
}

/// Handle to control the mobile server lifecycle
#[derive(Clone)]
pub struct MobileServerHandle {
    /// Shutdown signal sender
    shutdown_tx: Arc<RwLock<Option<watch::Sender<bool>>>>,
    /// Current server status
    status: Arc<RwLock<MobileServerStatus>>,
    /// The shared server state
    server_state: Arc<RwLock<Option<MobileServerState>>>,
    /// Cloudflared child process (killed on stop)
    tunnel_process: Arc<RwLock<Option<u32>>>,
}

impl MobileServerHandle {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Arc::new(RwLock::new(None)),
            status: Arc::new(RwLock::new(MobileServerStatus {
                running: false,
                mode: ConnectionMode::Internet,
                url: None,
                pin: String::new(),
                connected_clients: 0,
                default_role: SessionRole::Viewer,
                qr_svg: None,
                port: DEFAULT_PORT,
                sessions: Vec::new(),
            })),
            server_state: Arc::new(RwLock::new(None)),
            tunnel_process: Arc::new(RwLock::new(None)),
        }
    }

    /// Start the mobile server
    pub async fn start(
        &self,
        app_state: AppState,
        app_handle: tauri::AppHandle,
        mode: ConnectionMode,
        port: u16,
    ) -> Result<MobileServerStatus, String> {
        // Check if already running
        {
            let status = self.status.read().await;
            if status.running {
                return Err("Server is already running".into());
            }
        }

        // Generate a new 6-digit PIN
        let pin = generate_pin();

        // Create server state
        let server_state = MobileServerState {
            app_state,
            pin: Arc::new(RwLock::new(pin.clone())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            failed_attempts: Arc::new(RwLock::new(HashMap::new())),
            default_role: Arc::new(RwLock::new(SessionRole::Viewer)),
            app_handle: Some(app_handle),
        };

        // Store server state
        {
            let mut ss = self.server_state.write().await;
            *ss = Some(server_state.clone());
        }

        // Build the axum router
        let app = build_router(server_state.clone());

        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        {
            let mut tx = self.shutdown_tx.write().await;
            *tx = Some(shutdown_tx);
        }

        let status_clone = self.status.clone();

        match mode {
            ConnectionMode::Internet => {
                // Bind to localhost only — cloudflared will tunnel
                let bind_addr = SocketAddr::from(([127, 0, 0, 1], port));
                let listener = tokio::net::TcpListener::bind(bind_addr)
                    .await
                    .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

                info!("Mobile server listening on {} (awaiting Cloudflare tunnel)", bind_addr);

                // Spawn the axum server
                let server_shutdown_rx = shutdown_rx.clone();
                tokio::spawn(async move {
                    axum::serve(listener, app)
                        .with_graceful_shutdown(async move {
                            let mut rx = server_shutdown_rx;
                            while !*rx.borrow() {
                                if rx.changed().await.is_err() {
                                    break;
                                }
                            }
                        })
                        .await
                        .unwrap_or_else(|e| error!("Mobile server error: {}", e));
                });

                // Spawn Cloudflare Quick Tunnel in a separate task
                let cf_status = status_clone.clone();
                let cf_pin = pin.clone();
                let cf_shutdown_rx = shutdown_rx.clone();
                let cf_data_dir = server_state.app_state.data_dir.clone();
                let cf_process = self.tunnel_process.clone();

                tokio::spawn(async move {
                    match start_cloudflare_tunnel(port, &cf_data_dir, cf_shutdown_rx).await {
                        Ok((public_url, child)) => {
                            // Store the child process PID for cleanup
                            if let Some(pid) = child.id() {
                                *cf_process.write().await = Some(pid);
                            }
                            // Forget the child handle (process runs independently, killed by PID on stop)
                            std::mem::forget(child);

                            let qr_svg = generate_qr_svg(&format!("{}?pin={}", public_url, cf_pin));
                            let mut status = cf_status.write().await;
                            status.url = Some(public_url.clone());
                            status.qr_svg = Some(qr_svg);

                            info!("Cloudflare tunnel ready: {}", public_url);
                        }
                        Err(e) => {
                            error!("Failed to establish Cloudflare tunnel: {}", e);
                            let mut status = cf_status.write().await;
                            status.url = Some("Tunnel unavailable — use Local WiFi mode".into());
                        }
                    }
                });

                // Update status (URL will be set when tunnel connects)
                let mut status = self.status.write().await;
                status.running = true;
                status.mode = ConnectionMode::Internet;
                status.pin = pin;
                status.port = port;
                status.connected_clients = 0;
                status.default_role = SessionRole::Viewer;
                status.url = Some("Connecting tunnel...".into());
                status.qr_svg = None;

                Ok(status.clone())
            }
            ConnectionMode::LocalWifi => {
                // Get LAN IP
                let local_ip = local_ip_address::local_ip()
                    .map_err(|e| format!("Failed to detect local IP: {}", e))?;
                let bind_addr = SocketAddr::new(local_ip, port);
                let listener = tokio::net::TcpListener::bind(bind_addr)
                    .await
                    .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

                let url = format!("http://{}:{}", local_ip, port);
                let qr_svg = generate_qr_svg(&format!("{}?pin={}", url, pin));

                info!("Mobile server listening on {} (Local WiFi)", bind_addr);

                // Spawn the axum server
                tokio::spawn(async move {
                    let mut rx = shutdown_rx;
                    axum::serve(listener, app)
                        .with_graceful_shutdown(async move {
                            while !*rx.borrow() {
                                if rx.changed().await.is_err() {
                                    break;
                                }
                            }
                        })
                        .await
                        .unwrap_or_else(|e| error!("Mobile server error: {}", e));
                });

                // Update status
                let mut status = self.status.write().await;
                status.running = true;
                status.mode = ConnectionMode::LocalWifi;
                status.url = Some(url);
                status.pin = pin;
                status.port = port;
                status.connected_clients = 0;
                status.default_role = SessionRole::Viewer;
                status.qr_svg = Some(qr_svg);

                Ok(status.clone())
            }
        }
    }

    /// Stop the mobile server
    pub async fn stop(&self) -> Result<(), String> {
        let mut tx = self.shutdown_tx.write().await;
        if let Some(sender) = tx.take() {
            let _ = sender.send(true);
            info!("Mobile server shutdown signal sent");
        }

        // Kill cloudflared process if running
        let mut pid_lock = self.tunnel_process.write().await;
        if let Some(pid) = pid_lock.take() {
            info!("Killing cloudflared process (PID: {})", pid);
            #[cfg(windows)]
            {
                let _ = tokio::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output()
                    .await;
            }
            #[cfg(not(windows))]
            {
                let _ = tokio::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output()
                    .await;
            }
        }

        // Clear state
        let mut status = self.status.write().await;
        status.running = false;
        status.url = None;
        status.pin = String::new();
        status.connected_clients = 0;
        status.qr_svg = None;
        status.sessions = Vec::new();

        let mut ss = self.server_state.write().await;
        *ss = None;

        Ok(())
    }

    /// Get current server status
    pub async fn get_status(&self) -> MobileServerStatus {
        let mut status = self.status.read().await.clone();
        if let Some(ss) = self.server_state.read().await.as_ref() {
            let sessions = ss.sessions.read().await;
            status.connected_clients = sessions.len();
            status.default_role = *ss.default_role.read().await;

            let now = chrono::Utc::now();
            status.sessions = sessions
                .iter()
                .map(|(token, data)| {
                    let duration = now.signed_duration_since(data.connected_at);
                    let duration_str = if duration.num_hours() > 0 {
                        format!("{}h {}m", duration.num_hours(), duration.num_minutes() % 60)
                    } else if duration.num_minutes() > 0 {
                        format!("{}m", duration.num_minutes())
                    } else {
                        "Just now".to_string()
                    };

                    SessionInfo {
                        token_prefix: token.chars().take(8).collect(),
                        role: data.role,
                        label: data.label.clone(),
                        connected_at: data.connected_at.to_rfc3339(),
                        connected_duration: duration_str,
                    }
                })
                .collect();
        }
        status
    }

    /// Regenerate the PIN
    pub async fn regenerate_pin(&self) -> Result<String, String> {
        let ss = self.server_state.read().await;
        if let Some(state) = ss.as_ref() {
            let new_pin = generate_pin();
            let mut pin = state.pin.write().await;
            *pin = new_pin.clone();

            // Clear all sessions (force re-auth with new PIN)
            let mut sessions = state.sessions.write().await;
            sessions.clear();

            // Update status
            let mut status = self.status.write().await;
            status.pin = new_pin.clone();
            // Regenerate QR with new PIN
            if let Some(url) = &status.url {
                let base_url = url.split('?').next().unwrap_or(url);
                status.qr_svg = Some(generate_qr_svg(&format!("{}?pin={}", base_url, new_pin)));
            }

            Ok(new_pin)
        } else {
            Err("Server is not running".into())
        }
    }

    /// Set the default role for new sessions
    pub async fn set_default_role(&self, role: SessionRole) -> Result<SessionRole, String> {
        let ss = self.server_state.read().await;
        if let Some(state) = ss.as_ref() {
            let mut r = state.default_role.write().await;
            *r = role;
            Ok(role)
        } else {
            Err("Server is not running".into())
        }
    }

    /// Kick a session by its token prefix
    pub async fn kick_session(&self, token_prefix: &str) -> Result<(), String> {
        let ss = self.server_state.read().await;
        if let Some(state) = ss.as_ref() {
            let mut sessions = state.sessions.write().await;
            let key = sessions
                .keys()
                .find(|k| k.starts_with(token_prefix))
                .cloned();
            if let Some(key) = key {
                let data = sessions.remove(&key);
                info!("Kicked session {} ({})", token_prefix, data.map(|d| d.label).unwrap_or_default());

                // Emit event to desktop
                if let Some(app_handle) = &state.app_handle {
                    let _ = app_handle.emit("mobile-connection", MobileConnectionEvent {
                        event_type: "kicked".into(),
                        token_prefix: token_prefix.to_string(),
                        role: SessionRole::Viewer,
                        label: String::new(),
                        total_sessions: sessions.len(),
                    });
                }
                Ok(())
            } else {
                Err("Session not found".into())
            }
        } else {
            Err("Server is not running".into())
        }
    }

    /// Change the role of an existing session
    pub async fn set_session_role(&self, token_prefix: &str, role: SessionRole) -> Result<(), String> {
        let ss = self.server_state.read().await;
        if let Some(state) = ss.as_ref() {
            let mut sessions = state.sessions.write().await;
            let key = sessions
                .keys()
                .find(|k| k.starts_with(token_prefix))
                .cloned();
            if let Some(key) = key {
                if let Some(data) = sessions.get_mut(&key) {
                    data.role = role;
                    info!("Session {} role changed to {}", token_prefix, role);
                    Ok(())
                } else {
                    Err("Session not found".into())
                }
            } else {
                Err("Session not found".into())
            }
        } else {
            Err("Server is not running".into())
        }
    }
}

// ─── Cloudflare Quick Tunnel ───────────────────────────────────────

/// Path to the cloudflared binary inside the app data directory
fn cloudflared_bin_path(data_dir: &std::path::Path) -> std::path::PathBuf {
    #[cfg(windows)]
    { data_dir.join("bin").join("cloudflared.exe") }
    #[cfg(not(windows))]
    { data_dir.join("bin").join("cloudflared") }
}

/// Download cloudflared binary to the app data directory.
async fn download_cloudflared(data_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let bin_dir = data_dir.join("bin");
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;

    let dest = cloudflared_bin_path(data_dir);
    if dest.exists() {
        info!("cloudflared already exists at {}", dest.display());
        return Ok(dest);
    }

    #[cfg(windows)]
    let url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
    #[cfg(target_os = "linux")]
    let url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
    #[cfg(target_os = "macos")]
    let url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz";

    info!("Downloading cloudflared from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download cloudflared: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    tokio::fs::write(&dest, &bytes)
        .await
        .map_err(|e| format!("Failed to write cloudflared binary: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set executable permission: {}", e))?;
    }

    info!("cloudflared downloaded to {}", dest.display());
    Ok(dest)
}

/// Start a Cloudflare Quick Tunnel (trycloudflare.com).
/// Spawns `cloudflared tunnel --url http://localhost:{port}` and parses the
/// assigned URL from its stderr output. No account needed.
async fn start_cloudflare_tunnel(
    local_port: u16,
    data_dir: &std::path::Path,
    shutdown_rx: watch::Receiver<bool>,
) -> Result<(String, tokio::process::Child), String> {
    let bin_path = download_cloudflared(data_dir).await?;

    info!("Starting cloudflared quick tunnel for port {}", local_port);

    let mut cmd = tokio::process::Command::new(&bin_path);
    cmd.args(["tunnel", "--url", &format!("http://localhost:{}", local_port)])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW on Windows
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn cloudflared: {}", e))?;

    // cloudflared prints the assigned URL to stderr like:
    //   ... | INF +----------------------------+
    //   ... | INF |  https://xxx.trycloudflare.com |
    //   ... | INF +----------------------------+
    // We scan stderr lines for the trycloudflare.com URL.

    let stderr = child.stderr.take().ok_or("Failed to capture cloudflared stderr")?;
    let mut reader = tokio::io::BufReader::new(stderr).lines();

    let url = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        while let Some(line) = reader.next_line().await.map_err(|e: std::io::Error| e.to_string())? {
            // Look for the trycloudflare URL in the output
            if let Some(start) = line.find("https://") {
                let url_part = &line[start..];
                // Trim any trailing whitespace or pipe chars
                let url = url_part
                    .split_whitespace()
                    .next()
                    .unwrap_or(url_part)
                    .trim_end_matches('|')
                    .trim();
                if url.contains("trycloudflare.com") {
                    return Ok::<String, String>(url.to_string());
                }
            }

            // Check for shutdown during URL detection
            if *shutdown_rx.borrow() {
                return Err("Shutdown requested".into());
            }
        }
        Err("cloudflared exited without providing a tunnel URL".into())
    })
    .await
    .map_err(|_| "Timed out waiting for cloudflared tunnel URL (30s)".to_string())??;

    // Spawn a background task to drain remaining stderr so the process doesn't block
    let drain_shutdown = shutdown_rx.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                line = reader.next_line() => {
                    match line {
                        Ok(Some(_)) => continue,
                        _ => break,
                    }
                }
                _ = async {
                    while !*drain_shutdown.borrow() {
                        if drain_shutdown.clone().changed().await.is_err() { break; }
                    }
                } => break,
            }
        }
    });

    info!("Cloudflare tunnel established: {}", url);
    Ok((url, child))
}

// ─── Router ────────────────────────────────────────────────────────

/// Build the axum router with all routes and middleware
fn build_router(state: MobileServerState) -> Router {
    let public_routes = Router::new()
        .route("/api/auth", post(handle_pin_auth))
        .route("/api/auth/check", get(handle_auth_check))
        .route("/", get(serve_mobile_dashboard))
        .route("/app.js", get(serve_mobile_js))
        .route("/favicon.ico", get(serve_favicon));

    // Routes available to all authenticated users (viewer+)
    let viewer_routes = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/portfolio", get(handle_portfolio))
        .route("/api/portfolio/summary", get(handle_portfolio_summary))
        .route("/api/dashboard", get(handle_dashboard))
        .route("/api/trades/recent", get(handle_recent_trades))
        .route("/api/session/role", get(handle_session_role))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // Routes requiring Trusted+ role
    let trusted_routes = Router::new()
        .route("/api/sentinels", get(handle_sentinels))
        .route("/api/sniper", get(handle_sniper_status))
        .route("/api/dipbuyer", get(handle_dipbuyer_status))
        .route("/api/activity", get(handle_activity_log))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            trusted_middleware,
        ));

    // Routes requiring Admin role
    let admin_routes = Router::new()
        .route("/api/trade", post(handle_trade))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            admin_middleware,
        ));

    Router::new()
        .merge(public_routes)
        .merge(viewer_routes)
        .merge(trusted_routes)
        .merge(admin_routes)
        .with_state(state)
}

// ─── Auth Middleware ───────────────────────────────────────────────

/// Extract session token from cookie or query param
fn extract_session_token(headers: &HeaderMap, query: &str) -> Option<String> {
    // Check cookie first
    if let Some(cookie) = headers.get(header::COOKIE) {
        if let Ok(cookie_str) = cookie.to_str() {
            for part in cookie_str.split(';') {
                let part = part.trim();
                if let Some(token) = part.strip_prefix("session=") {
                    return Some(token.to_string());
                }
            }
        }
    }

    // Check query param fallback
    for pair in query.split('&') {
        if let Some(val) = pair.strip_prefix("session=") {
            let decoded = val.replace("%20", " ");
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
    }
    None
}

/// Auth middleware: validates session token on protected routes
async fn auth_middleware(
    AxumState(state): AxumState<MobileServerState>,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let query = req.uri().query().unwrap_or("");
    let token = extract_session_token(req.headers(), query);

    if let Some(token) = token {
        let mut sessions = state.sessions.write().await;
        if let Some(data) = sessions.get_mut(&token) {
            data.last_activity = chrono::Utc::now();
            return Ok(next.run(req).await);
        }
    }

    Ok((StatusCode::UNAUTHORIZED, "Unauthorized").into_response())
}

/// Middleware requiring Trusted or Admin role
async fn trusted_middleware(
    AxumState(state): AxumState<MobileServerState>,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let query = req.uri().query().unwrap_or("");
    let token = extract_session_token(req.headers(), query);

    if let Some(token) = token {
        let mut sessions = state.sessions.write().await;
        if let Some(data) = sessions.get_mut(&token) {
            if matches!(data.role, SessionRole::Trusted | SessionRole::Admin) {
                data.last_activity = chrono::Utc::now();
                return Ok(next.run(req).await);
            }
            return Ok((StatusCode::FORBIDDEN, "Insufficient permissions — Trusted role required").into_response());
        }
    }

    Ok((StatusCode::UNAUTHORIZED, "Unauthorized").into_response())
}

/// Middleware requiring Admin role
async fn admin_middleware(
    AxumState(state): AxumState<MobileServerState>,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let query = req.uri().query().unwrap_or("");
    let token = extract_session_token(req.headers(), query);

    if let Some(token) = token {
        let mut sessions = state.sessions.write().await;
        if let Some(data) = sessions.get_mut(&token) {
            if matches!(data.role, SessionRole::Admin) {
                data.last_activity = chrono::Utc::now();
                return Ok(next.run(req).await);
            }
            return Ok((StatusCode::FORBIDDEN, "Insufficient permissions — Admin role required").into_response());
        }
    }

    Ok((StatusCode::UNAUTHORIZED, "Unauthorized").into_response())
}

// ─── Route Handlers ────────────────────────────────────────────────

#[derive(Deserialize)]
struct PinRequest {
    pin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    success: bool,
    session_token: Option<String>,
    role: Option<SessionRole>,
    message: String,
}

/// POST /api/auth — verify PIN and issue session token
async fn handle_pin_auth(
    AxumState(state): AxumState<MobileServerState>,
    Json(body): Json<PinRequest>,
) -> impl IntoResponse {
    let expected_pin = state.pin.read().await.clone();

    if body.pin == expected_pin {
        let mut sessions = state.sessions.write().await;
        if sessions.len() >= MAX_SESSIONS {
            if let Some(oldest_key) = sessions
                .iter()
                .min_by_key(|(_, d)| d.connected_at)
                .map(|(k, _)| k.clone())
            {
                sessions.remove(&oldest_key);
            }
        }

        let default_role = *state.default_role.read().await;
        let token = uuid::Uuid::new_v4().to_string();
        let session_num = sessions.len() + 1;
        let label = format!("Device {}", session_num);
        let now = chrono::Utc::now();

        sessions.insert(token.clone(), SessionData {
            role: default_role,
            label: label.clone(),
            connected_at: now,
            last_activity: now,
        });

        let token_prefix: String = token.chars().take(8).collect();
        let total = sessions.len();
        drop(sessions);

        // Emit connection event to desktop
        if let Some(app_handle) = &state.app_handle {
            let _ = app_handle.emit("mobile-connection", MobileConnectionEvent {
                event_type: "connected".into(),
                token_prefix: token_prefix.clone(),
                role: default_role,
                label: label.clone(),
                total_sessions: total,
            });

            // Also send a native notification
            if let Some(notif) = app_handle.try_state::<crate::NotificationHandle>() {
                notif.send_raw("Mobile Device Connected", &format!("{} joined as {}", label, default_role)).await;
            }
        }

        info!("Mobile session created: {} (role: {})", token_prefix, default_role);

        let mut headers = HeaderMap::new();
        headers.insert(
            header::SET_COOKIE,
            format!("session={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400", token)
                .parse()
                .unwrap(),
        );

        (
            StatusCode::OK,
            headers,
            Json(AuthResponse {
                success: true,
                session_token: Some(token),
                role: Some(default_role),
                message: "Authenticated successfully".into(),
            }),
        )
    } else {
        (
            StatusCode::UNAUTHORIZED,
            HeaderMap::new(),
            Json(AuthResponse {
                success: false,
                session_token: None,
                role: None,
                message: "Invalid PIN".into(),
            }),
        )
    }
}

/// GET /api/auth/check — check if current session is valid
async fn handle_auth_check(
    headers: HeaderMap,
    AxumState(state): AxumState<MobileServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let query_str = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");
    let token = extract_session_token(&headers, &query_str);

    if let Some(token) = token {
        let sessions = state.sessions.read().await;
        if let Some(data) = sessions.get(&token) {
            return (StatusCode::OK, Json(serde_json::json!({
                "valid": true,
                "role": data.role,
                "label": data.label,
            }))).into_response();
        }
    }
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"valid": false}))).into_response()
}

/// GET /api/status — server health check
async fn handle_status(
    AxumState(_state): AxumState<MobileServerState>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "app": "RugPlay Manager",
        "version": "0.1.0",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// GET /api/portfolio — full portfolio with holdings
async fn handle_portfolio(
    AxumState(state): AxumState<MobileServerState>,
) -> Result<impl IntoResponse, StatusCode> {
    let portfolio = fetch_portfolio(&state).await.map_err(|e| {
        error!("Portfolio fetch failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(portfolio))
}

/// GET /api/portfolio/summary — summary stats
async fn handle_portfolio_summary(
    AxumState(state): AxumState<MobileServerState>,
) -> Result<impl IntoResponse, StatusCode> {
    let portfolio = fetch_portfolio(&state).await.map_err(|e| {
        error!("Portfolio summary fetch failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let summary = PortfolioSummary::from(&portfolio);
    Ok(Json(summary))
}

/// GET /api/dashboard — module statuses overview
async fn handle_dashboard(
    AxumState(state): AxumState<MobileServerState>,
) -> impl IntoResponse {
    let mut modules = serde_json::Map::new();

    if let Some(app_handle) = &state.app_handle {
        // Sentinel status
        if let Some(handle) = app_handle.try_state::<crate::SentinelMonitorHandle>() {
            let handle: &crate::SentinelMonitorHandle = &handle;
            let status = handle.status().await;
            let is_paused = handle.is_paused().await;
            modules.insert("sentinel".into(), serde_json::json!({
                "status": format!("{:?}", status),
                "isPaused": is_paused,
            }));
        }

        // Harvester — always enabled
        modules.insert("harvester".into(), serde_json::json!({
            "enabled": true,
        }));

        // Sniper status
        if let Some(handle) = app_handle.try_state::<crate::SniperHandle>() {
            let handle: &crate::SniperHandle = &handle;
            let enabled = handle.is_enabled();
            modules.insert("sniper".into(), serde_json::json!({
                "enabled": enabled,
            }));
        }

        // Mirror status
        if let Some(handle) = app_handle.try_state::<crate::MirrorHandle>() {
            let handle: &crate::MirrorHandle = &handle;
            let enabled = handle.is_enabled();
            modules.insert("mirror".into(), serde_json::json!({
                "enabled": enabled,
            }));
        }

        // Dip Buyer status
        if let Some(handle) = app_handle.try_state::<crate::DipBuyerHandle>() {
            let handle: &crate::DipBuyerHandle = &handle;
            let enabled = handle.is_enabled();
            modules.insert("dipbuyer".into(), serde_json::json!({
                "enabled": enabled,
            }));
        }
    }

    Json(serde_json::json!({
        "modules": modules,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// GET /api/trades/recent — recent trade feed
async fn handle_recent_trades(
    AxumState(state): AxumState<MobileServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, StatusCode> {
    let limit: u32 = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(20);

    let client = build_client(&state).await.map_err(|e| {
        error!("Client build failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let trades = client.get_recent_trades(limit).await.map_err(|e| {
        error!("Recent trades fetch failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let trades: Vec<RecentTrade> = trades
        .into_iter()
        .filter(|t| {
            let tt = t.trade_type.to_uppercase();
            tt == "BUY" || tt == "SELL"
        })
        .collect();

    Ok(Json(trades))
}

/// GET /api/session/role — returns the current session's role
async fn handle_session_role(
    headers: HeaderMap,
    AxumState(state): AxumState<MobileServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let query_str = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");
    let token = extract_session_token(&headers, &query_str);

    if let Some(token) = token {
        let sessions = state.sessions.read().await;
        if let Some(data) = sessions.get(&token) {
            return (StatusCode::OK, Json(serde_json::json!({
                "role": data.role,
                "label": data.label,
            }))).into_response();
        }
    }
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Unauthorized"}))).into_response()
}

/// GET /api/sentinels — list active sentinels (Trusted+)
async fn handle_sentinels(
    AxumState(state): AxumState<MobileServerState>,
) -> Result<impl IntoResponse, StatusCode> {
    let db_guard = state.app_state.db.read().await;
    let db = db_guard.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let sentinels = sqlite::get_sentinels(db.pool(), profile.id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(sentinels))
}

/// GET /api/sniper — sniper config and status (Trusted+)
async fn handle_sniper_status(
    AxumState(state): AxumState<MobileServerState>,
) -> impl IntoResponse {
    let mut result = serde_json::json!({ "enabled": false });

    if let Some(app_handle) = &state.app_handle {
        if let Some(handle) = app_handle.try_state::<crate::SniperHandle>() {
            let config = handle.get_config().await;
            result = serde_json::json!({
                "enabled": handle.is_enabled(),
                "config": config,
            });
        }
    }
    Json(result)
}

/// GET /api/dipbuyer — dip buyer config and status (Trusted+)
async fn handle_dipbuyer_status(
    AxumState(state): AxumState<MobileServerState>,
) -> impl IntoResponse {
    let mut result = serde_json::json!({ "enabled": false });

    if let Some(app_handle) = &state.app_handle {
        if let Some(handle) = app_handle.try_state::<crate::DipBuyerHandle>() {
            let config = handle.get_config().await;
            result = serde_json::json!({
                "enabled": handle.is_enabled(),
                "config": {
                    "preset": format!("{:?}", config.preset).to_lowercase(),
                    "buyAmountUsd": config.buy_amount_usd,
                    "minSellValueUsd": config.min_sell_value_usd,
                    "skipTopNHolders": config.skip_top_n_holders,
                    "maxDailyBuys": config.max_daily_buys,
                    "autoCreateSentinel": config.auto_create_sentinel,
                },
            });
        }
    }
    Json(result)
}

/// GET /api/activity — recent automation events (Trusted+)
async fn handle_activity_log(
    AxumState(state): AxumState<MobileServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, StatusCode> {
    let limit: u32 = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(50);

    let db_guard = state.app_state.db.read().await;
    let db = db_guard.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let transactions = sqlite::get_transactions(db.pool(), profile.id, limit, 0, None, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Get triggered sentinels
    let sentinels = sqlite::get_sentinels(db.pool(), profile.id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let triggered: Vec<_> = sentinels
        .iter()
        .filter(|s| s.triggered_at.is_some())
        .collect();

    Ok(Json(serde_json::json!({
        "transactions": transactions,
        "triggeredSentinels": triggered,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TradePayload {
    symbol: String,
    trade_type: String,
    amount: f64,
}

/// POST /api/trade — execute a buy/sell trade (Admin only)
async fn handle_trade(
    AxumState(state): AxumState<MobileServerState>,
    Json(body): Json<TradePayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let app_handle = state.app_handle.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let trade_type = match body.trade_type.to_uppercase().as_str() {
        "BUY" => TradeType::Buy,
        "SELL" => TradeType::Sell,
        _ => return Ok((StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid trade type"}))).into_response()),
    };

    if body.amount <= 0.0 {
        return Ok((StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Amount must be positive"}))).into_response());
    }

    let executor = app_handle
        .try_state::<crate::TradeExecutorHandle>()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = executor
        .submit_trade(
            body.symbol.clone(),
            trade_type,
            body.amount,
            crate::trade_executor::TradePriority::Normal,
            "Mobile trade".to_string(),
        )
        .await;

    match result {
        Ok(response) => Ok(Json(serde_json::json!({
            "success": true,
            "response": {
                "newPrice": response.new_price,
                "priceImpact": response.price_impact,
            }
        })).into_response()),
        Err(e) => {
            warn!("Mobile trade failed: {}", e);
            Ok((StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e}))).into_response())
        }
    }
}

// ─── Helper Functions ──────────────────────────────────────────────

/// Build a RugplayClient from the active profile's token
async fn build_client(state: &MobileServerState) -> Result<RugplayClient, String> {
    let db_guard = state.app_state.db.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let profile = sqlite::get_active_profile(db.pool())
        .await
        .map_err(|e| format!("Failed to get active profile: {}", e))?
        .ok_or("No active profile")?;

    let encrypted = sqlite::get_profile_token(db.pool(), profile.id)
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?
        .ok_or("No token found")?;

    let token = state
        .app_state
        .encryptor
        .decrypt(&encrypted)
        .map_err(|e| format!("Failed to decrypt token: {}", e))?;

    Ok(RugplayClient::new(&token))
}

/// Fetch portfolio using the active profile
async fn fetch_portfolio(state: &MobileServerState) -> Result<PortfolioResponse, String> {
    let client = build_client(state).await?;
    client
        .get_portfolio()
        .await
        .map_err(|e| format!("Portfolio fetch failed: {}", e))
}

/// Generate a random 6-digit PIN
fn generate_pin() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000u32))
}

/// Generate a QR code as SVG string
pub fn generate_qr_svg(data: &str) -> String {
    use qrcode::render::svg;
    use qrcode::QrCode;

    match QrCode::new(data.as_bytes()) {
        Ok(code) => code
            .render::<svg::Color>()
            .min_dimensions(200, 200)
            .dark_color(svg::Color("#ffffff"))
            .light_color(svg::Color("#0f172a"))
            .quiet_zone(true)
            .build(),
        Err(e) => {
            error!("QR generation failed: {}", e);
            format!("<svg><text>QR Error: {}</text></svg>", e)
        }
    }
}

// ─── Static File Serving ───────────────────────────────────────────

/// Serve the mobile dashboard HTML
async fn serve_mobile_dashboard() -> impl IntoResponse {
    Html(include_str!("mobile_dashboard.html"))
}

/// Serve the mobile dashboard JavaScript
async fn serve_mobile_js() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/javascript")],
        include_str!("mobile_app.js"),
    )
}

/// Serve favicon
async fn serve_favicon() -> impl IntoResponse {
    StatusCode::NO_CONTENT
}
