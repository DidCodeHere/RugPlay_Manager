//! Phase 6: Embedded mobile access server
//!
//! Provides a lightweight axum HTTP server that serves a mobile-friendly dashboard
//! and REST API, allowing users to view/control the app from any phone browser.
//!
//! Supports two connection modes:
//! - **Internet**: Uses bore tunnel (bore.pub) — accessible from anywhere, no user IP exposed
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
use rugplay_core::{PortfolioResponse, PortfolioSummary, RecentTrade};
use rugplay_networking::RugplayClient;
use rugplay_persistence::sqlite;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{watch, RwLock};
use tracing::{error, info, warn};

/// Default port for the mobile server
const DEFAULT_PORT: u16 = 9876;

/// Max failed PIN attempts before IP is blocked
const MAX_PIN_FAILURES: u32 = 5;

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

/// Shared state for the mobile server
#[derive(Clone)]
pub struct MobileServerState {
    /// Reference to the main app state (DB, encryptor, cache)
    pub app_state: AppState,
    /// The 6-digit PIN required for auth
    pub pin: Arc<RwLock<String>>,
    /// Active session tokens (token → creation time)
    pub sessions: Arc<RwLock<HashMap<String, chrono::DateTime<chrono::Utc>>>>,
    /// Failed PIN attempts per IP
    pub failed_attempts: Arc<RwLock<HashMap<String, (u32, chrono::DateTime<chrono::Utc>)>>>,
    /// Whether remote control (trading) is enabled
    pub control_enabled: Arc<RwLock<bool>>,
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
    pub control_enabled: bool,
    pub qr_svg: Option<String>,
    pub port: u16,
    /// Details for each active session
    pub sessions: Vec<SessionInfo>,
}

/// Information about a single connected session
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// Short token prefix for identification (first 8 chars)
    pub token_prefix: String,
    /// When this session was created
    pub connected_at: String,
    /// How long ago the session was created
    pub connected_duration: String,
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
                control_enabled: false,
                qr_svg: None,
                port: DEFAULT_PORT,
                sessions: Vec::new(),
            })),
            server_state: Arc::new(RwLock::new(None)),
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
            control_enabled: Arc::new(RwLock::new(false)),
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
                // Bind to localhost only — bore will tunnel
                let bind_addr = SocketAddr::from(([127, 0, 0, 1], port));
                let listener = tokio::net::TcpListener::bind(bind_addr)
                    .await
                    .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

                info!("Mobile server listening on {} (awaiting bore tunnel)", bind_addr);

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

                // Spawn bore tunnel in a separate task
                let bore_status = status_clone.clone();
                let bore_pin = pin.clone();
                let bore_port = port;
                let bore_shutdown_rx = shutdown_rx.clone();

                tokio::spawn(async move {
                    match start_bore_tunnel(bore_port, bore_shutdown_rx).await {
                        Ok((public_url, _remote_port)) => {
                            let full_url = public_url.clone();
                            let qr_svg = generate_qr_svg(&format!("{}?pin={}", full_url, bore_pin));

                            let mut status = bore_status.write().await;
                            status.url = Some(full_url);
                            status.qr_svg = Some(qr_svg);

                            info!("bore tunnel established: {}", public_url);
                        }
                        Err(e) => {
                            error!("Failed to establish bore tunnel: {}", e);
                            let mut status = bore_status.write().await;
                            status.url = Some(format!("Tunnel failed: {}", e));
                        }
                    }
                });

                // Update status (URL will be set when bore connects)
                let mut status = self.status.write().await;
                status.running = true;
                status.mode = ConnectionMode::Internet;
                status.pin = pin;
                status.port = port;
                status.connected_clients = 0;
                status.control_enabled = false;
                // URL and QR will be populated by the bore task
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
                status.control_enabled = false;
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
        // Update connected clients count and session details from session state
        if let Some(ss) = self.server_state.read().await.as_ref() {
            let sessions = ss.sessions.read().await;
            status.connected_clients = sessions.len();
            status.control_enabled = *ss.control_enabled.read().await;

            // Build session info list
            let now = chrono::Utc::now();
            status.sessions = sessions
                .iter()
                .map(|(token, created_at)| {
                    let duration = now.signed_duration_since(*created_at);
                    let duration_str = if duration.num_hours() > 0 {
                        format!("{}h {}m", duration.num_hours(), duration.num_minutes() % 60)
                    } else if duration.num_minutes() > 0 {
                        format!("{}m", duration.num_minutes())
                    } else {
                        "Just now".to_string()
                    };

                    SessionInfo {
                        token_prefix: token.chars().take(8).collect(),
                        connected_at: created_at.to_rfc3339(),
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

    /// Toggle remote control (trading) capability
    pub async fn set_control_enabled(&self, enabled: bool) -> Result<bool, String> {
        let ss = self.server_state.read().await;
        if let Some(state) = ss.as_ref() {
            let mut ctrl = state.control_enabled.write().await;
            *ctrl = enabled;
            Ok(enabled)
        } else {
            Err("Server is not running".into())
        }
    }
}

// ─── bore Tunnel ───────────────────────────────────────────────────

/// Start a bore tunnel to expose the local server to the internet
async fn start_bore_tunnel(
    local_port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<(String, u16), String> {
    use bore_cli::client::Client;

    // Connect to bore.pub relay with a random port (0 = auto-assign)
    let client = Client::new("localhost", local_port, "bore.pub", 0, None)
        .await
        .map_err(|e| format!("Failed to connect to bore.pub: {}", e))?;

    let remote_port = client.remote_port();
    let public_url = format!("http://bore.pub:{}", remote_port);

    info!("bore tunnel: localhost:{} → bore.pub:{}", local_port, remote_port);

    // Run the bore client in the background — it will listen for connections
    tokio::spawn(async move {
        tokio::select! {
            result = client.listen() => {
                if let Err(e) = result {
                    warn!("bore tunnel disconnected: {}", e);
                }
            }
            _ = async {
                while !*shutdown_rx.borrow() {
                    if shutdown_rx.changed().await.is_err() {
                        break;
                    }
                }
            } => {
                info!("bore tunnel shutting down");
            }
        }
    });

    Ok((public_url, remote_port))
}

// ─── Router ────────────────────────────────────────────────────────

/// Build the axum router with all routes and middleware
fn build_router(state: MobileServerState) -> Router {
    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/auth", post(handle_pin_auth))
        .route("/api/auth/check", get(handle_auth_check))
        .route("/", get(serve_mobile_dashboard))
        .route("/app.js", get(serve_mobile_js))
        .route("/favicon.ico", get(serve_favicon));

    // Protected routes (require valid session)
    let protected_routes = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/portfolio", get(handle_portfolio))
        .route("/api/portfolio/summary", get(handle_portfolio_summary))
        .route("/api/dashboard", get(handle_dashboard))
        .route("/api/trades/recent", get(handle_recent_trades))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
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
        let sessions = state.sessions.read().await;
        if sessions.contains_key(&token) {
            return Ok(next.run(req).await);
        }
    }

    Ok((StatusCode::UNAUTHORIZED, "Unauthorized — please enter PIN").into_response())
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
    message: String,
}

/// POST /api/auth — verify PIN and issue session token
async fn handle_pin_auth(
    AxumState(state): AxumState<MobileServerState>,
    Json(body): Json<PinRequest>,
) -> impl IntoResponse {
    let expected_pin = state.pin.read().await.clone();

    if body.pin == expected_pin {
        // Check session limit
        let mut sessions = state.sessions.write().await;
        if sessions.len() >= MAX_SESSIONS {
            // Remove oldest session
            if let Some(oldest_key) = sessions
                .iter()
                .min_by_key(|(_, t)| *t)
                .map(|(k, _)| k.clone())
            {
                sessions.remove(&oldest_key);
            }
        }

        // Issue new session token
        let token = uuid::Uuid::new_v4().to_string();
        sessions.insert(token.clone(), chrono::Utc::now());

        // Set cookie header
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
        if sessions.contains_key(&token) {
            return (StatusCode::OK, Json(serde_json::json!({"valid": true}))).into_response();
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

    // Filter out transfers
    let trades: Vec<RecentTrade> = trades
        .into_iter()
        .filter(|t| {
            let tt = t.trade_type.to_uppercase();
            tt == "BUY" || tt == "SELL"
        })
        .collect();

    Ok(Json(trades))
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
