//! Composio OAuth PKCE flow for desktop apps.
//!
//! Blocking flow (same pattern as Slack):
//! 1. `begin_oauth_flow()` — sets up PKCE, opens browser, then BLOCKS until
//!    the callback arrives (TCP listener) or the user pastes a URL manually.
//! 2. `complete_oauth_from_url()` — called by the "paste URL" command while
//!    the main flow is blocking; signals it to complete immediately.
//!
//! The frontend simply `await`s the Tauri command — no events, no listeners.

use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;

/// Fixed port for the OAuth callback listener.
const CALLBACK_PORT: u16 = 19823;

// -- Shared pending state --

struct PendingOAuth {
    auth_url: String,
    verifier: String,
    client_id: String,
    redirect_uri: String,
    token_endpoint: String,
    /// Auth server URL discovered during the current flow — persisted into
    /// the keychain as `discoveryState.authorizationServerUrl` so that
    /// Claude Code's spawned MCP clients (running inside Houston agents)
    /// can find the same entry.
    auth_server_url: String,
    /// RFC 9728 protected resource metadata URL — persisted as
    /// `discoveryState.resourceMetadataUrl`.
    resource_metadata_url: String,
}

static PENDING: Mutex<Option<PendingOAuth>> = Mutex::new(None);

// Channel used by `complete_oauth_from_url` to signal a successful paste-URL
// completion to the blocking `begin_oauth_flow`. Only carries success (unit) —
// errors are returned directly by the paste command and leave the flow open.
static MANUAL_DONE_TX: Mutex<Option<mpsc::UnboundedSender<()>>> = Mutex::new(None);

// -- Public API --

/// Open the browser and BLOCK until OAuth completes (TCP callback or paste URL).
/// Returns Ok(()) when the token has been stored in the keychain.
/// The frontend simply awaits this Tauri command — no events required.
pub async fn begin_oauth_flow() -> Result<(), String> {
    // If a previous flow is still running, kill it by dropping its sender.
    // MutexGuard must be dropped before any .await, so use an explicit block.
    let old_tx = { MANUAL_DONE_TX.lock().unwrap().take() };
    if let Some(old_tx) = old_tx {
        drop(old_tx); // closing the sender causes the old rx.recv() to return None
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    let discovery = discover_oauth_metadata().await?;

    let redirect_uri = format!("http://127.0.0.1:{CALLBACK_PORT}/callback");

    let reg_endpoint = discovery
        .metadata
        .registration_endpoint
        .as_deref()
        .ok_or("Server does not support dynamic client registration")?;
    let registration = register_client(reg_endpoint, &redirect_uri).await?;
    tracing::debug!(
        "[composio:auth] Registered client: {}",
        registration.client_id
    );

    let verifier = generate_verifier();
    let challenge = compute_challenge(&verifier);

    let auth_url = build_auth_url(
        &discovery.metadata.authorization_endpoint,
        &registration.client_id,
        &redirect_uri,
        DEFAULT_SCOPE,
        &challenge,
    );

    // Guard dropped at end of block — before any .await.
    {
        *PENDING.lock().unwrap() = Some(PendingOAuth {
            auth_url: auth_url.clone(),
            verifier,
            client_id: registration.client_id,
            redirect_uri,
            token_endpoint: discovery.metadata.token_endpoint,
            auth_server_url: discovery.auth_server_url,
            resource_metadata_url: discovery.resource_metadata_url,
        });
    }

    // Open browser
    std::process::Command::new("open")
        .arg(&auth_url)
        .spawn()
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    tracing::info!("[composio:auth] Waiting for OAuth callback on port {CALLBACK_PORT}…");

    // Set up the manual-completion channel. Guard dropped at end of block.
    let (tx, mut rx) = mpsc::unbounded_channel::<()>();
    {
        *MANUAL_DONE_TX.lock().unwrap() = Some(tx);
    }

    // Block until EITHER the TCP callback arrives OR the paste-URL path signals.
    let result = tokio::select! {
        result = run_callback_listener() => result,
        received = rx.recv() => {
            if received.is_some() {
                Ok(()) // paste-URL path already stored the token
            } else {
                Err("Auth flow cancelled".to_string())
            }
        }
    };

    // Clean up — guard dropped at end of block.
    {
        *MANUAL_DONE_TX.lock().unwrap() = None;
    }

    if result.is_ok() {
        tracing::info!("[composio:auth] OAuth completed successfully");
    } else {
        tracing::warn!("[composio:auth] OAuth failed: {:?}", result);
    }
    result
}

/// Re-open the browser with the pending auth URL.
pub fn reopen_oauth_browser() -> Result<(), String> {
    let pending = PENDING.lock().unwrap();
    let p = pending.as_ref().ok_or("No pending OAuth flow")?;
    std::process::Command::new("open")
        .arg(&p.auth_url)
        .spawn()
        .map_err(|e| format!("Failed to open browser: {e}"))?;
    Ok(())
}

/// Complete the OAuth flow from a manually pasted callback URL.
/// On success, signals the blocking `begin_oauth_flow` to return immediately.
pub async fn complete_oauth_from_url(callback_url: &str) -> Result<(), String> {
    if let Some(err) = extract_param(callback_url, "error") {
        let desc = extract_param(callback_url, "error_description").unwrap_or(err);
        return Err(format!("OAuth error: {desc}"));
    }

    let code = extract_param(callback_url, "code")
        .ok_or("No authorization code found in the pasted URL")?;

    exchange_and_store(&code).await?;

    // Signal the blocking begin_oauth_flow to return.
    if let Some(tx) = MANUAL_DONE_TX.lock().unwrap().as_ref() {
        let _ = tx.send(());
    }

    Ok(())
}

/// Silently refresh the access token using a stored refresh token.
pub async fn refresh_access_token() -> Result<String, String> {
    let refresh_token =
        read_refresh_token().ok_or("No refresh token stored — full re-auth required")?;
    let client_id = read_client_id().ok_or("No stored client_id — full re-auth required")?;

    let discovery = discover_oauth_metadata().await?;

    let client = reqwest::Client::new();
    let resp = client
        .post(&discovery.metadata.token_endpoint)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
            ("client_id", &client_id),
        ])
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Refresh returned {status}: {body}"));
    }

    let token: TokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Invalid refresh response: {e}"))?;

    update_keychain_token(
        &token.access_token,
        token.expires_in,
        token.refresh_token.as_deref(),
        &client_id,
        Some(&discovery.auth_server_url),
        Some(&discovery.resource_metadata_url),
    )?;

    tracing::info!("[composio] Token refreshed silently");
    Ok(token.access_token)
}

// -- Background listener --

async fn run_callback_listener() -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{CALLBACK_PORT}"))
        .await
        .map_err(|e| format!("Failed to bind port {CALLBACK_PORT}: {e}"))?;

    let (mut stream, _) =
        tokio::time::timeout(std::time::Duration::from_secs(300), listener.accept())
            .await
            .map_err(|_| "OAuth timed out — no response within 5 minutes".to_string())?
            .map_err(|e| format!("Failed to accept callback: {e}"))?;

    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    if let Some(err) = extract_param(path, "error") {
        let desc = extract_param(path, "error_description").unwrap_or_else(|| err.clone());
        send_response(&mut stream, "Authorization failed", &desc).await;
        return Err(format!("OAuth error: {desc}"));
    }

    let code = extract_param(path, "code").ok_or("No authorization code in callback")?;

    send_response(
        &mut stream,
        "Connected to Composio!",
        "You can close this tab and return to Houston.",
    )
    .await;

    exchange_and_store(&code).await
}

// -- Shared exchange logic --

async fn exchange_and_store(code: &str) -> Result<(), String> {
    let (verifier, client_id, redirect_uri, token_endpoint, auth_server_url, resource_metadata_url) = {
        let pending = PENDING.lock().unwrap();
        let p = pending
            .as_ref()
            .ok_or("No pending OAuth flow to complete")?;
        (
            p.verifier.clone(),
            p.client_id.clone(),
            p.redirect_uri.clone(),
            p.token_endpoint.clone(),
            p.auth_server_url.clone(),
            p.resource_metadata_url.clone(),
        )
    };

    let token = exchange_code(&token_endpoint, code, &client_id, &redirect_uri, &verifier).await?;
    update_keychain_token(
        &token.access_token,
        token.expires_in,
        token.refresh_token.as_deref(),
        &client_id,
        Some(&auth_server_url),
        Some(&resource_metadata_url),
    )?;

    // Clear pending state
    {
        *PENDING.lock().unwrap() = None;
    }

    tracing::info!("[composio] OAuth flow completed successfully");
    Ok(())
}

/// Default scope requested for the Composio MCP OAuth flow. These are the
/// standard MCP public-client scopes and match Composio's advertised
/// `scopes_supported`.
const DEFAULT_SCOPE: &str = "openid profile email offline_access";

// -- Internal types --

#[derive(Deserialize)]
struct OAuthMetadata {
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: Option<String>,
}

/// Result of OAuth discovery. Carries the RFC 8414 metadata plus the URLs
/// we followed to get it, so we can persist them in the keychain as
/// `discoveryState` (Claude Code's spawned MCP clients read this format).
struct DiscoveryInfo {
    metadata: OAuthMetadata,
    auth_server_url: String,
    resource_metadata_url: String,
}

#[derive(Deserialize)]
struct ClientRegistration {
    client_id: String,
    #[allow(dead_code)]
    client_secret: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
}

// -- Read tokens from keychain --

fn read_refresh_token() -> Option<String> {
    read_composio_field("refreshToken")
}

fn read_client_id() -> Option<String> {
    read_composio_field("clientId")
}

/// Read a string field from the first `composio*` entry in `mcpOAuth` that
/// has a non-empty value.
fn read_composio_field(field: &str) -> Option<String> {
    let username = get_username().ok()?;
    let data = read_keychain(&username).ok()?;
    let mcp_oauth = data.get("mcpOAuth")?.as_object()?;
    for (key, info) in mcp_oauth {
        if !key.starts_with("composio") {
            continue;
        }
        if let Some(v) = info
            .get(field)
            .and_then(|t| t.as_str())
            .filter(|s| !s.is_empty())
        {
            return Some(v.to_string());
        }
    }
    None
}

// -- OAuth metadata discovery (RFC 9728 + RFC 8414) --

/// Discover the OAuth authorization server for the Composio MCP endpoint by
/// probing it unauthenticated and following the standard protected-resource
/// metadata chain. Requires only the MCP URL from `~/.claude.json`; no
/// pre-populated keychain config.
///
/// Chain:
/// 1. POST an `initialize` to the MCP endpoint → expect `401` with a
///    `WWW-Authenticate: Bearer ..., resource_metadata="..."` header.
/// 2. GET the `resource_metadata` URL → read `authorization_servers[0]`.
/// 3. GET `{auth_server}/.well-known/oauth-authorization-server` (RFC 8414).
async fn discover_oauth_metadata() -> Result<DiscoveryInfo, String> {
    let mcp_url = crate::mcp::read_composio_url()
        .ok_or("Composio MCP server not configured in ~/.claude.json")?;

    let client = reqwest::Client::new();

    // Step 1: probe the MCP endpoint to get the WWW-Authenticate header.
    let init_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "houston", "version": "0" }
        }
    });

    let resp = client
        .post(&mcp_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&init_body)
        .send()
        .await
        .map_err(|e| format!("Failed to probe MCP server: {e}"))?;

    let status = resp.status();
    if status != reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!(
            "Expected 401 from MCP probe, got {status} — cannot discover OAuth config"
        ));
    }

    let www_auth = resp
        .headers()
        .get("www-authenticate")
        .and_then(|v| v.to_str().ok())
        .ok_or("MCP 401 response is missing WWW-Authenticate header")?
        .to_string();

    let resource_metadata_url = parse_www_auth_param(&www_auth, "resource_metadata")
        .ok_or("WWW-Authenticate header has no resource_metadata parameter")?;

    tracing::debug!("[composio:auth] Protected resource metadata: {resource_metadata_url}");

    // Step 2: fetch the protected resource metadata to find the auth server.
    let pr_meta: serde_json::Value = client
        .get(&resource_metadata_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch protected resource metadata: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid protected resource metadata JSON: {e}"))?;

    let auth_server_url = pr_meta
        .get("authorization_servers")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .ok_or("No authorization_servers in protected resource metadata")?
        .to_string();

    tracing::debug!("[composio:auth] Authorization server: {auth_server_url}");

    // Step 3: fetch the auth server metadata.
    let metadata = fetch_auth_server_metadata(&client, &auth_server_url).await?;

    Ok(DiscoveryInfo {
        metadata,
        auth_server_url,
        resource_metadata_url,
    })
}

async fn fetch_auth_server_metadata(
    client: &reqwest::Client,
    auth_server_url: &str,
) -> Result<OAuthMetadata, String> {
    // Composio hosts the well-known path at the ROOT of the auth server's
    // host, not under its path prefix (the former returns 200, the latter
    // 404). We try root first, then fall back to the full path and finally
    // to the OIDC discovery document.
    let root = root_url(auth_server_url);
    let candidates = [
        format!("{root}/.well-known/oauth-authorization-server"),
        format!("{auth_server_url}/.well-known/oauth-authorization-server"),
        format!("{root}/.well-known/openid-configuration"),
        format!("{auth_server_url}/.well-known/openid-configuration"),
    ];

    for url in &candidates {
        tracing::debug!("[composio:auth] Trying: {url}");
        let resp = match client.get(url).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        if !resp.status().is_success() {
            tracing::debug!("[composio:auth]   → {}", resp.status());
            continue;
        }
        if let Ok(meta) = resp.json::<OAuthMetadata>().await {
            return Ok(meta);
        }
    }

    Err(format!(
        "Could not find OAuth metadata for auth server {auth_server_url}"
    ))
}

/// Parse a single parameter value out of a `WWW-Authenticate: Bearer ...`
/// header. Handles both quoted and unquoted values.
fn parse_www_auth_param(header: &str, key: &str) -> Option<String> {
    // A WWW-Authenticate header value looks like:
    //   Bearer error="unauthorized", error_description="...", resource_metadata="https://..."
    // We split on commas and find the part that starts with `key=`.
    let needle = format!("{key}=");
    for part in header.split(',') {
        let trimmed = part.trim().trim_start_matches("Bearer ").trim_start();
        if let Some(rest) = trimmed.strip_prefix(&needle) {
            return Some(rest.trim_matches('"').to_string());
        }
    }
    None
}

fn root_url(url: &str) -> String {
    if let Some(idx) = url.find("://") {
        let after_scheme = &url[idx + 3..];
        if let Some(slash) = after_scheme.find('/') {
            return url[..idx + 3 + slash].to_string();
        }
    }
    url.to_string()
}

// -- Dynamic client registration (RFC 7591) --

async fn register_client(
    registration_endpoint: &str,
    redirect_uri: &str,
) -> Result<ClientRegistration, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "client_name": "Houston Desktop App",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    });

    let resp = client
        .post(registration_endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Client registration failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Client registration returned {status}: {text}"));
    }

    serde_json::from_str(&text).map_err(|e| format!("Invalid registration response: {e}"))
}

// -- PKCE --

fn generate_verifier() -> String {
    let bytes1 = uuid::Uuid::new_v4().into_bytes();
    let bytes2 = uuid::Uuid::new_v4().into_bytes();
    let bytes3 = uuid::Uuid::new_v4().into_bytes();
    let mut combined = Vec::with_capacity(48);
    combined.extend_from_slice(&bytes1);
    combined.extend_from_slice(&bytes2);
    combined.extend_from_slice(&bytes3);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&combined)
}

fn compute_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

// -- Build authorization URL --

fn build_auth_url(
    endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    challenge: &str,
) -> String {
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state=composio",
        endpoint,
        pct_encode(client_id),
        pct_encode(redirect_uri),
        pct_encode(scope),
        challenge,
    )
}

fn pct_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                String::from(b as char)
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
}

// -- URL parameter extraction --

fn extract_param(url: &str, key: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    query
        .split('&')
        .find(|p| p.starts_with(&format!("{key}=")))?
        .strip_prefix(&format!("{key}="))
        .map(|v| v.replace('+', " "))
        .map(|v| pct_decode(&v))
}

fn pct_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else {
            result.push(c);
        }
    }
    result
}

// -- HTTP response to browser --

async fn send_response(stream: &mut tokio::net::TcpStream, title: &str, message: &str) {
    let html = format!(
        concat!(
            "<!DOCTYPE html><html><head><style>",
            "body{{font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;",
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;",
            "background:#fff;color:#0d0d0d;flex-direction:column;gap:16px}}",
            "h1{{font-size:20px;font-weight:500;margin:0}}",
            "p{{font-size:14px;color:#676767;margin:0}}",
            "</style></head><body>",
            "<svg viewBox='0 0 412.248 448.898' width='48' height='48' fill='#161615'>",
            "<path d='M54.438,370.05a372.979,372.979,0,0,0,36.546,16.539c42.934,16.457,81.036,26.955,127.045,32.718,38.952,4.879,98.013,6.119,133.934-9.694l.22-28.709,10.9-4.2.1,7.633c.131,9.532,10.175,10.024,10.111,16.564l-.19,19.454a10.892,10.892,0,0,1-5.271,8.79A125.921,125.921,0,0,1,333.1,442.267c-27.35,5.945-54.827,7.61-83.009,6.115A501.786,501.786,0,0,1,135.308,429.09C98.277,418.317,63.295,404.2,30.364,384.378c-1.82-1.1-4.62-4.1-4.586-5.833l.486-25.225,11.07-8.41c1.485-34.5-.533-22.947-14.764-49.9-27.447-52-29.2-106.518-8.847-163.015,9.56,20.2,21.153,38.25,37.42,52.877C37.675,162.726,27.2,139.979,22.078,114.644,58.63,40.233,137.3-5.66,220.15.562c51,3.831,94.258,25.571,130.394,61.982-11.956-3.184-22.192-5.554-33.74-6.752C275.709,24.666,227.275,10.9,176.055,19.538c-20.923,3.528-34,6.957-50.682,16.877L139.5,33.929l15.86-2.793c8.528-1.5,24.632-1.04,33.836-.192,22.661,2.088,53.554,13.706,71.674,28.987-12.6,3.789-24.839,7.031-37.177,12.526C168.9,96.859,123.836,137.377,92.651,188.4c-7.872-2.92-15.5-4.417-23.465-2.461,29.782,6.032,38.956,41.129,31.8,67.976-2.394,8.985-7.428,16.16-14.663,22.377a346.506,346.506,0,0,0,147.25,97.184l12.006,21.237c1.847,3.267.35,10.053.346,14.518C191.213,405.71,137.381,395,88.063,371.576L54.751,355.753a55.521,55.521,0,0,0-.313,14.3m15.8-103.638c8.757-2.088,12.715-9.164,15.688-16.5,3.95-12.971,2.434-27.431-5.321-38.706-5.394-7.843-14.789-12.194-23.84-9.339A20.8,20.8,0,0,0,43.4,214.587c8.355-7.946,19.246-8.317,27.089-.185,12.642,13.106,13.272,37.962-.251,52.01M56.2,335.674c19.3,9.688,37.093,17.6,57.609,25.556l.46-40.938c.063-5.627-7.1-8.159-10.894-7.39-13.274,2.69-5.888,17.088-7.963,29.218L55.617,322.693c-1,4.557-1.287,9.423.582,12.981m139.579,48.288c1.144-4.393,1.22-8.69-.783-11.451a512.739,512.739,0,0,1-66.018-17.972,16.313,16.313,0,0,0-.129,12.157c8.276,2.7,16.239,5.339,24.7,7.329Z'/>",
            "<path d='M325.964,373.522c-78.683,7.33-171.286-41.71-224.763-98.653,20.982-21.383,19.582-56.385,1.375-79.483,14.126-22.058,29.682-42,48.543-59.74C194.08,95.233,252.771,65.207,312.936,67.539c31.512,1.812,71.082,11.318,70.475,49.792a215.176,215.176,0,0,1,7.448,201.107c3.547,38.249-33.525,51.774-64.9,55.084m-156.623-69.56c44.588,29.3,106.347,54.129,159.883,46.515,8.458-1.2,16.5-3.934,24.588-6.324,5-1.476,7.137-5.17,9.631-9.01,48.185-74.159,42.9-170.662-13.764-238.39C301.111,78.61,245.166,94.247,202.936,121.54c-16.981,10.974-32.909,23.164-46.245,38.481-14.795,16.993-20.759,39.234-21.865,61.356-1.175,23.493,5.307,45.09,17.461,64.8a53.6,53.6,0,0,0,17.054,17.788'/>",
            "<path d='M298.533,409.094c-4.467.414-7.883-1.707-9.4-5.237a12.287,12.287,0,0,1,1.075-10.992c1.473-2.484,5.351-4.9,8.887-5.18l31.941-2.488a8.616,8.616,0,0,1,9.262,6.052c.913,3.365.494,9.3-3.5,10.617-12.359,4.06-24.719,5.973-38.264,7.228'/>",
            "<rect width='15.334' height='16.211' transform='translate(258.6 409.939) rotate(-89.717)'/>",
            "<path d='M370.408,283.292c-6.086,17.577-13.539,33.4-26.392,47.208,26.021-57.679,30.288-124.219,4.132-182.266-6.661-14.783-15.007-27.347-24.809-41.076,5.144.8,12.975.86,16.972,4.164,7.836,6.477,12.518,15.527,17.384,24.5,24.5,45.2,29.763,98.227,12.713,147.465'/>",
            "</svg>",
            "<h1>{}</h1><p>{}</p>",
            "</body></html>"
        ),
        title,
        message,
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(resp.as_bytes()).await;
}

// -- Exchange code for token --

async fn exchange_code(
    token_endpoint: &str,
    code: &str,
    client_id: &str,
    redirect_uri: &str,
    verifier: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(token_endpoint)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Token exchange returned {status}: {body}"));
    }

    serde_json::from_str(&body).map_err(|e| format!("Invalid token response: {e}"))
}

// -- Update keychain --

/// Fallback key used when Houston needs to create a `mcpOAuth.composio*`
/// entry and no `composio*` key exists yet. Normally Houston writes into
/// whichever `composio*` keys already exist (including Claude Code's own
/// `composio|<hash>` entry) so that Claude Code's MCP client — the one
/// that the models running *inside* Houston agents use — can find the
/// tokens under its expected key.
const HOUSTON_COMPOSIO_KEY: &str = "composio|houston";

/// Write the freshly-obtained OAuth tokens into the keychain.
///
/// Strategy: update EVERY `composio*` entry under `mcpOAuth`, not just one.
/// The `Claude Code-credentials` keychain can contain several such entries
/// at once — one that Claude Code itself created (with a hashed key like
/// `composio|3cef502fa536d618`) and one that Houston created. Writing to
/// all of them means that both Houston's own Tauri commands AND the Claude
/// Code sessions that Houston spawns as agents will find a valid token
/// under whichever key they look up.
///
/// If no `composio*` entry exists at all, we create one under
/// `HOUSTON_COMPOSIO_KEY` with the full `discoveryState` shape that Claude
/// Code expects, so a freshly-spawned Claude Code session can also use it.
fn update_keychain_token(
    access_token: &str,
    expires_in: Option<u64>,
    refresh_token: Option<&str>,
    client_id: &str,
    auth_server_url: Option<&str>,
    resource_metadata_url: Option<&str>,
) -> Result<(), String> {
    let username = get_username()?;
    let mut data = read_keychain(&username).unwrap_or_else(|_| serde_json::json!({}));

    if !data.is_object() {
        data = serde_json::json!({});
    }
    let root = data.as_object_mut().expect("data is an object");

    if !root.get("mcpOAuth").map(|v| v.is_object()).unwrap_or(false) {
        root.insert("mcpOAuth".to_string(), serde_json::json!({}));
    }
    let mcp_oauth = root
        .get_mut("mcpOAuth")
        .and_then(|v| v.as_object_mut())
        .expect("mcpOAuth is an object");

    let existing_keys: Vec<String> = mcp_oauth
        .keys()
        .filter(|k| k.starts_with("composio"))
        .cloned()
        .collect();

    // If nothing exists yet, seed Houston's own entry — otherwise Claude
    // Code's spawned MCP clients would have nothing to read.
    let target_keys: Vec<String> = if existing_keys.is_empty() {
        mcp_oauth.insert(HOUSTON_COMPOSIO_KEY.to_string(), serde_json::json!({}));
        vec![HOUSTON_COMPOSIO_KEY.to_string()]
    } else {
        existing_keys
    };

    let expires_at = expires_in.map(|exp| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + exp
    });

    for key in &target_keys {
        let info = mcp_oauth
            .entry(key.clone())
            .or_insert_with(|| serde_json::json!({}));
        if !info.is_object() {
            *info = serde_json::json!({});
        }
        let obj = info.as_object_mut().expect("just set to object");

        obj.insert(
            "accessToken".to_string(),
            serde_json::Value::String(access_token.to_string()),
        );
        obj.insert(
            "clientId".to_string(),
            serde_json::Value::String(client_id.to_string()),
        );
        if let Some(exp_at) = expires_at {
            obj.insert(
                "expiresAt".to_string(),
                serde_json::Value::Number(exp_at.into()),
            );
        }
        if let Some(rt) = refresh_token {
            obj.insert(
                "refreshToken".to_string(),
                serde_json::Value::String(rt.to_string()),
            );
        }

        // Populate `discoveryState` only if missing — preserving whatever
        // Claude Code originally wrote. Many Claude Code versions use this
        // field to discover the auth-server for silent refresh.
        if let (Some(as_url), Some(rm_url)) = (auth_server_url, resource_metadata_url) {
            let needs_discovery_state = obj
                .get("discoveryState")
                .map(|v| !v.is_object())
                .unwrap_or(true);
            if needs_discovery_state {
                obj.insert(
                    "discoveryState".to_string(),
                    serde_json::json!({
                        "authorizationServerUrl": as_url,
                        "resourceMetadataUrl": rm_url,
                    }),
                );
            }
        }

        // Default scope when the entry has none — matches what Composio
        // advertises in `scopes_supported`.
        if obj
            .get("scope")
            .and_then(|v| v.as_str())
            .map(str::is_empty)
            .unwrap_or(true)
        {
            obj.insert(
                "scope".to_string(),
                serde_json::Value::String(DEFAULT_SCOPE.to_string()),
            );
        }
    }

    tracing::info!(
        "[composio] Stored tokens into {} keychain entr{}: {:?}",
        target_keys.len(),
        if target_keys.len() == 1 { "y" } else { "ies" },
        target_keys
    );

    write_keychain(&username, &data)
}

// -- Keychain helpers --

fn get_username() -> Result<String, String> {
    let output = std::process::Command::new("whoami")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_keychain(username: &str) -> Result<serde_json::Value, String> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-a",
            username,
            "-w",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Could not read keychain".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(json_str.trim()).map_err(|e| format!("Invalid keychain JSON: {e}"))
}

fn write_keychain(username: &str, data: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_string(data).map_err(|e| format!("Failed to serialize: {e}"))?;

    let status = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            "Claude Code-credentials",
            "-a",
            username,
            "-w",
            &json,
        ])
        .status()
        .map_err(|e| format!("Failed to update keychain: {e}"))?;

    if !status.success() {
        return Err("Failed to update keychain".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_resource_metadata_from_www_authenticate() {
        let header = r#"Bearer error="unauthorized", error_description="Missing authentication: provide Authorization: Bearer or x-consumer-api-key header", resource_metadata="https://connect.composio.dev/.well-known/oauth-protected-resource""#;
        assert_eq!(
            parse_www_auth_param(header, "resource_metadata"),
            Some("https://connect.composio.dev/.well-known/oauth-protected-resource".to_string())
        );
        assert_eq!(
            parse_www_auth_param(header, "error"),
            Some("unauthorized".to_string())
        );
    }

    #[test]
    fn returns_none_for_missing_param() {
        let header = r#"Bearer error="unauthorized""#;
        assert_eq!(parse_www_auth_param(header, "resource_metadata"), None);
    }

    #[test]
    fn handles_bearer_prefix_without_space() {
        // Defensive: some servers might format without a trailing space.
        let header = r#"Bearer resource_metadata="https://example.com/rm""#;
        assert_eq!(
            parse_www_auth_param(header, "resource_metadata"),
            Some("https://example.com/rm".to_string())
        );
    }

    #[test]
    fn root_url_strips_path() {
        assert_eq!(
            root_url("https://connect.composio.dev/api/v3/auth/dash"),
            "https://connect.composio.dev"
        );
        assert_eq!(root_url("https://example.com"), "https://example.com");
    }
}
