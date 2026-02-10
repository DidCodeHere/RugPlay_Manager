//! Rugplay HTTP client with cookie-based authentication

use reqwest::{
    cookie::Jar,
    header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, COOKIE, REFERER, USER_AGENT},
    Client, Response,
};
use rugplay_core::{
    ApiTransactionsResponse, CoinDetails, CoinDetailsResponse, CoinHoldersResponse, Error,
    LeaderboardResponse, MarketResponse, PortfolioResponse, RecentTrade, RecentTradesResponse,
    Result, SessionResponse, TradeRequest, TradeResponse, UserProfile,
    UserPublicProfileResponse,
};
use rugplay_persistence::cache::CoinCache;
use std::sync::Arc;
use tracing::{debug, error, instrument};

const BASE_URL: &str = "https://rugplay.com";
const API_BASE: &str = "https://rugplay.com/api";
// Use a real browser User-Agent to avoid being blocked
const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// HTTP client for interacting with Rugplay API
/// 
/// Emulates browser requests by including the session cookie
/// in all authenticated requests. Optionally uses an in-memory
/// cache for coin data to reduce API calls.
pub struct RugplayClient {
    http: Client,
    session_token: String,
    /// Optional shared coin cache (shared across all clients)
    cache: Option<Arc<CoinCache>>,
}

impl RugplayClient {
    /// Create a new client with the given session token
    /// 
    /// # Arguments
    /// * `session_token` - The `__Secure-better-auth.session_token` value
    pub fn new(session_token: &str) -> Self {
        // Create cookie jar and add the session cookie
        let jar = Arc::new(Jar::default());
        let url = BASE_URL.parse().unwrap();
        jar.add_cookie_str(
            &format!("__Secure-better-auth.session_token={}", session_token),
            &url,
        );

        // Build client with cookie support
        let http = Client::builder()
            .cookie_provider(jar)
            .user_agent(USER_AGENT_VALUE)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http,
            session_token: session_token.to_string(),
            cache: None,
        }
    }

    /// Create a new client with a shared coin cache
    pub fn new_with_cache(session_token: &str, cache: Arc<CoinCache>) -> Self {
        let mut client = Self::new(session_token);
        client.cache = Some(cache);
        client
    }

    /// Get default headers for requests (mimics browser)
    fn default_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        
        // Browser-like headers to avoid being blocked
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/plain, */*"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
        headers.insert(REFERER, HeaderValue::from_static("https://rugplay.com/"));
        headers.insert(
            "Origin",
            HeaderValue::from_static("https://rugplay.com"),
        );
        headers.insert(
            "Sec-Fetch-Dest",
            HeaderValue::from_static("empty"),
        );
        headers.insert(
            "Sec-Fetch-Mode",
            HeaderValue::from_static("cors"),
        );
        headers.insert(
            "Sec-Fetch-Site",
            HeaderValue::from_static("same-origin"),
        );
        
        // Session cookie
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!(
                "__Secure-better-auth.session_token={}",
                self.session_token
            ))
            .unwrap(),
        );
        
        headers
    }

    /// Check if response indicates authentication failure
    fn check_auth_error(response: &Response) -> Option<Error> {
        match response.status().as_u16() {
            401 => Some(Error::TokenExpired),
            403 => Some(Error::AuthenticationError("Access forbidden".to_string())),
            _ => None,
        }
    }

    /// Verify the session token is valid by fetching session info
    #[instrument(skip(self))]
    pub async fn verify_auth(&self) -> Result<UserProfile> {
        debug!("Verifying authentication via /auth/get-session");
        self.get_session().await
    }

    /// Get the current user's session and profile
    /// Uses the correct endpoint: /api/auth/get-session
    #[instrument(skip(self))]
    pub async fn get_session(&self) -> Result<UserProfile> {
        let url = format!("{}/auth/get-session", API_BASE);
        
        debug!("Fetching session from: {}", url);
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        debug!("Response status: {}", response.status());

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Session request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        // Parse the session response which contains { session: {...}, user: {...} }
        let session_response: SessionResponse = response.json().await.map_err(|e| {
            error!("Failed to parse session response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        let profile = session_response.into_user_profile();
        debug!("Session verified for user: {}", profile.username);
        Ok(profile)
    }

    /// Get the current user's profile (alias for get_session)
    #[instrument(skip(self))]
    pub async fn get_profile(&self) -> Result<UserProfile> {
        self.get_session().await
    }

    /// Get the user's current balance
    #[instrument(skip(self))]
    pub async fn get_balance(&self) -> Result<f64> {
        let profile = self.get_profile().await?;
        Ok(profile.balance)
    }

    /// Get details for a specific coin (cache-aware)
    #[instrument(skip(self))]
    pub async fn get_coin(&self, symbol: &str) -> Result<CoinDetails> {
        // Check cache first
        if let Some(ref cache) = self.cache {
            if let Some(cached) = cache.get(symbol) {
                debug!("Cache hit for {}", symbol);
                return Ok(cached);
            }
        }

        let url = format!("{}/coin/{}", API_BASE, symbol);
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Coin request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        // API returns { "coin": {...}, "candlestickData": [...], ... }
        let wrapper: CoinDetailsResponse = response.json().await.map_err(|e| {
            error!("Failed to parse coin response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Coin fetched: {} @ ${}", wrapper.coin.symbol, wrapper.coin.current_price);

        // Store in cache
        if let Some(ref cache) = self.cache {
            cache.insert(wrapper.coin.clone());
        }

        Ok(wrapper.coin)
    }

    /// Get full coin details including chart data
    #[instrument(skip(self))]
    pub async fn get_coin_with_chart(&self, symbol: &str, timeframe: &str) -> Result<CoinDetailsResponse> {
        let url = format!("{}/coin/{}?timeframe={}", API_BASE, symbol, timeframe);
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Coin request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let details: CoinDetailsResponse = response.json().await.map_err(|e| {
            error!("Failed to parse coin response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Coin with chart fetched: {} @ ${}, {} candlesticks", 
               details.coin.symbol, details.coin.current_price, details.candlestick_data.len());
        Ok(details)
    }

    /// Execute a trade (buy or sell)
    /// 
    /// # Important
    /// - For BUY: `amount` is in USD
    /// - For SELL: `amount` is in coins (truncate to 8 decimals!)
    #[instrument(skip(self))]
    pub async fn trade(&self, symbol: &str, request: TradeRequest) -> Result<TradeResponse> {
        let url = format!("{}/coin/{}/trade", API_BASE, symbol);
        
        debug!("Executing {:?} trade for {}", request.trade_type, symbol);

        let response = self
            .http
            .post(&url)
            .headers(self.default_headers())
            .json(&request)
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let status = response.status();
        if status.is_client_error() || status.is_server_error() {
            let body = response.text().await.unwrap_or_default();
            error!("Trade request failed: HTTP {} — {}", status, body);
            return Err(Error::TradeError(format!("HTTP {}: {}", status, body)));
        }

        let trade_response: TradeResponse = response.json().await.map_err(|e| {
            error!("Failed to parse trade response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        if !trade_response.success {
            return Err(Error::TradeError("Trade was not successful".to_string()));
        }

        debug!(
            "Trade executed: new price ${}, impact {}%",
            trade_response.new_price,
            trade_response.price_impact * 100.0
        );

        // Invalidate cache for this coin (price changed)
        if let Some(ref cache) = self.cache {
            cache.invalidate(symbol);
        }

        Ok(trade_response)
    }

    /// Get the user's full portfolio with all holdings
    #[instrument(skip(self))]
    pub async fn get_portfolio(&self) -> Result<PortfolioResponse> {
        let url = format!("{}/portfolio/total", API_BASE);
        
        debug!("Fetching portfolio from: {}", url);

        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        debug!("Portfolio response status: {}", response.status());

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Portfolio request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let portfolio: PortfolioResponse = response.json().await.map_err(|e| {
            error!("Failed to parse portfolio response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!(
            "Portfolio fetched: {} holdings, total value ${:.2}",
            portfolio.coin_holdings.len(),
            portfolio.total_value
        );
        Ok(portfolio)
    }

    /// Get recent trades from the platform (live feed)
    #[instrument(skip(self))]
    pub async fn get_recent_trades(&self, limit: u32) -> Result<Vec<RecentTrade>> {
        let url = format!("{}/trades/recent?limit={}", API_BASE, limit);
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Recent trades request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let data: RecentTradesResponse = response.json().await.map_err(|e| {
            error!("Failed to parse recent trades: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        Ok(data.trades)
    }

    /// Get the user's transaction history from the Rugplay API
    #[instrument(skip(self))]
    pub async fn get_transactions(
        &self,
        page: u32,
        limit: u32,
        trade_type: Option<&str>,
        search: Option<&str>,
    ) -> Result<ApiTransactionsResponse> {
        let mut url = format!(
            "{}/transactions?page={}&limit={}&sortBy=timestamp&sortOrder=desc",
            API_BASE, page, limit
        );

        if let Some(tt) = trade_type {
            url.push_str(&format!("&type={}", tt));
        } else {
            url.push_str("&type=all");
        }

        if let Some(s) = search {
            if !s.is_empty() {
                url.push_str(&format!("&search={}", s));
            }
        }

        debug!("Fetching transactions from: {}", url);

        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Transactions request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let body_text = response.text().await.map_err(|e| {
            error!("Failed to read transactions response body: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        let data: ApiTransactionsResponse = serde_json::from_str(&body_text).map_err(|e| {
            error!("Failed to parse transactions: {}. Body preview: {}", e, &body_text[..body_text.len().min(500)]);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Fetched {} transactions (total: {})", data.transactions.len(), data.total);
        Ok(data)
    }

    /// Get coin holders
    #[instrument(skip(self))]
    pub async fn get_coin_holders(&self, symbol: &str, limit: u32) -> Result<CoinHoldersResponse> {
        let url = format!("{}/coin/{}/holders?limit={}", API_BASE, symbol, limit);
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Holders request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let holders: CoinHoldersResponse = response.json().await.map_err(|e| {
            error!("Failed to parse holders response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        Ok(holders)
    }

    /// Get market coins with sorting
    #[instrument(skip(self))]
    pub async fn get_market(
        &self,
        page: u32,
        limit: u32,
        sort_by: &str,
        sort_order: &str,
        search: Option<&str>,
    ) -> Result<MarketResponse> {
        let mut url = format!(
            "{}/market?page={}&limit={}&sortBy={}&sortOrder={}",
            API_BASE, page, limit, sort_by, sort_order
        );
        if let Some(q) = search {
            if !q.is_empty() {
                // Simple URL encoding for search query
                let encoded: String = q.chars().map(|c| {
                    match c {
                        ' ' => "%20".to_string(),
                        '&' => "%26".to_string(),
                        '=' => "%3D".to_string(),
                        '#' => "%23".to_string(),
                        _ => c.to_string(),
                    }
                }).collect();
                url.push_str(&format!("&search={}", encoded));
            }
        }
        
        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Market request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let market: MarketResponse = response.json().await.map_err(|e| {
            error!("Failed to parse market response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        Ok(market)
    }

    /// Check reward claim status
    #[instrument(skip(self))]
    pub async fn get_reward_status(&self) -> Result<rugplay_core::RewardStatusResponse> {
        let url = format!("{}/rewards/claim", API_BASE);

        debug!("Checking reward status");

        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let status: rugplay_core::RewardStatusResponse = response
            .error_for_status()
            .map_err(|e| {
                error!("Reward status request failed: {}", e);
                Error::ApiError(e.to_string())
            })?
            .json()
            .await
            .map_err(|e| {
                error!("Failed to parse reward status response: {}", e);
                Error::InvalidData(e.to_string())
            })?;

        debug!("Reward status: canClaim={}, timeRemaining={}ms ({}s)", status.can_claim, status.time_remaining, status.time_remaining / 1000);
        Ok(status)
    }

    /// Claim daily reward
    #[instrument(skip(self))]
    pub async fn claim_daily_reward(&self) -> Result<rugplay_core::RewardClaimResponse> {
        let url = format!("{}/rewards/claim", API_BASE);
        
        debug!("Claiming daily reward");

        let response = self
            .http
            .post(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let claim: rugplay_core::RewardClaimResponse = response
            .error_for_status()
            .map_err(|e| {
                error!("Claim request failed: {}", e);
                Error::ApiError(e.to_string())
            })?
            .json()
            .await
            .map_err(|e| {
                error!("Failed to parse claim response: {}", e);
                Error::InvalidData(e.to_string())
            })?;

        debug!("Daily reward claimed: ${}", claim.reward_amount);
        Ok(claim)
    }

    /// Get a user's public profile by user ID
    /// 
    /// Calls `GET /api/user/{USER_ID}` which returns profile info,
    /// stats, recent transactions, and created coins.
    #[instrument(skip(self), fields(user_id))]
    pub async fn get_user_profile(&self, user_id: &str) -> Result<UserPublicProfileResponse> {
        let url = format!("{}/user/{}", API_BASE, user_id);
        debug!("Fetching public profile for user: {}", user_id);

        let resp = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await
            .map_err(|e| {
                error!("User profile request failed: {}", e);
                Error::ApiError(e.to_string())
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("User profile request failed with status {}: {}", status, body);
            return Err(Error::ApiError(format!(
                "User profile request failed with status {}: {}",
                status, body
            )));
        }

        let profile: UserPublicProfileResponse = resp.json().await.map_err(|e| {
            error!("Failed to parse user profile response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Fetched profile for user: {} ({})", profile.profile.username, user_id);
        Ok(profile)
    }

    /// Get the platform leaderboard
    #[instrument(skip(self))]
    pub async fn get_leaderboard(&self) -> Result<LeaderboardResponse> {
        let url = format!("{}/leaderboard", API_BASE);
        debug!("Fetching leaderboard");

        let resp = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await
            .map_err(|e| {
                error!("Leaderboard request failed: {}", e);
                Error::ApiError(e.to_string())
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(Error::ApiError(format!(
                "Leaderboard request failed with status {}: {}", status, body
            )));
        }

        let leaderboard: LeaderboardResponse = resp.json().await.map_err(|e| {
            error!("Failed to parse leaderboard response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Leaderboard fetched: {} rugpullers, {} losers, {} cash kings, {} paper millionaires",
            leaderboard.top_rugpullers.len(),
            leaderboard.biggest_losers.len(),
            leaderboard.cash_kings.len(),
            leaderboard.paper_millionaires.len(),
        );
        Ok(leaderboard)
    }

    /// Get the session token (for re-authentication checks)
    pub fn session_token(&self) -> &str {
        &self.session_token
    }

    /// Get a reference to the cache (if one is attached)
    pub fn cache(&self) -> Option<&Arc<CoinCache>> {
        self.cache.as_ref()
    }

    /// Invalidate a specific coin in the cache
    pub fn invalidate_cache(&self, symbol: &str) {
        if let Some(ref cache) = self.cache {
            cache.invalidate(symbol);
        }
    }

    /// Get comments for a coin
    #[instrument(skip(self))]
    pub async fn get_coin_comments(&self, symbol: &str) -> Result<rugplay_core::CoinCommentsResponse> {
        let url = format!("{}/coin/{}/comments", API_BASE, symbol);
        debug!("Fetching comments for {}", symbol);

        let response = self
            .http
            .get(&url)
            .headers(self.default_headers())
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Comments request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let data: rugplay_core::CoinCommentsResponse = response.json().await.map_err(|e| {
            error!("Failed to parse comments response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Fetched {} comments for {}", data.comments.len(), symbol);
        Ok(data)
    }

    /// Post a comment on a coin
    #[instrument(skip(self))]
    pub async fn post_coin_comment(&self, symbol: &str, content: &str) -> Result<rugplay_core::CoinComment> {
        let url = format!("{}/coin/{}/comments", API_BASE, symbol);
        debug!("Posting comment on {}", symbol);

        let body = serde_json::json!({ "content": content });

        let response = self
            .http
            .post(&url)
            .headers(self.default_headers())
            .json(&body)
            .send()
            .await?;

        if let Some(err) = Self::check_auth_error(&response) {
            return Err(err);
        }

        let response = response.error_for_status().map_err(|e| {
            error!("Post comment request failed: {}", e);
            Error::ApiError(e.to_string())
        })?;

        let data: rugplay_core::PostCommentResponse = response.json().await.map_err(|e| {
            error!("Failed to parse post comment response: {}", e);
            Error::InvalidData(e.to_string())
        })?;

        debug!("Comment posted on {} by user {}", symbol, data.comment.user_username);
        Ok(data.comment)
    }
}
