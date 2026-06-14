//! `/v1/composio/*` REST routes.
//!
//! Wraps the transport-neutral `houston_composio::commands` API. Tauri
//! command wrappers in `app/houston-tauri/src/composio_commands.rs` stay
//! as thin proxies for the desktop adapter.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use houston_composio::apps::ComposioAppEntry;
use houston_composio::cli::{
    ComposioStatus, CompleteLoginError, StartLinkError, StartLinkResponse, StartLoginResponse,
};
use houston_composio::commands as inner;
use houston_composio::connection_watcher;
use houston_engine_core::CoreError;
use houston_engine_protocol::ErrorCode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/composio/status", get(status))
        .route("/composio/cli-installed", get(cli_installed))
        .route("/composio/cli", post(install_cli))
        .route("/composio/login", post(start_login))
        .route("/composio/login/complete", post(complete_login))
        .route("/composio/logout", post(logout))
        .route("/composio/apps", get(list_apps))
        .route(
            "/composio/connections",
            get(list_connections).post(connect_app),
        )
        .route("/composio/connections/disconnect", post(disconnect_app))
        .route("/composio/connections/reconnect", post(reconnect_app))
        .route("/composio/connections/watch", post(watch_connection))
}

#[derive(Serialize)]
struct CliInstalled {
    installed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompleteLogin {
    cli_key: String,
}

#[derive(Deserialize)]
struct ConnectApp {
    toolkit: String,
}

#[derive(Deserialize)]
struct ToolkitRef {
    toolkit: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReconnectResponse {
    redirect_url: Option<String>,
}

#[derive(Deserialize)]
struct WatchConnection {
    toolkit: String,
}

fn lift(e: String) -> ApiError {
    ApiError(CoreError::Internal(e))
}

/// Map a login-completion failure to the wire error.
///
/// A `TimedOut` is an expected outcome — the user closed the sign-in tab
/// or never approved — so it surfaces as a typed `composio_login_timeout`
/// the frontend renders as localized, retryable copy (and deliberately
/// does NOT report to crash tracking; that reporting was the HOU-434
/// Sentry noise). Anything else is an internal fault worth a bug report.
fn map_complete_login_err(e: CompleteLoginError) -> ApiError {
    match e {
        CompleteLoginError::TimedOut => ApiError(CoreError::Labeled {
            code: ErrorCode::Unavailable,
            kind: "composio_login_timeout",
            message: "Sign-in timed out waiting for browser approval.".to_string(),
        }),
        CompleteLoginError::Failed(detail) => ApiError(CoreError::Internal(detail)),
    }
}

async fn status(State(_st): State<Arc<ServerState>>) -> Json<ComposioStatus> {
    Json(inner::list_composio_connections().await)
}

async fn cli_installed(State(_st): State<Arc<ServerState>>) -> Json<CliInstalled> {
    Json(CliInstalled {
        installed: inner::is_composio_cli_installed(),
    })
}

async fn install_cli(State(_st): State<Arc<ServerState>>) -> Result<(), ApiError> {
    inner::install_composio_cli().await.map_err(lift)
}

async fn start_login(
    State(_st): State<Arc<ServerState>>,
) -> Result<Json<StartLoginResponse>, ApiError> {
    inner::start_composio_oauth().await.map(Json).map_err(lift)
}

async fn complete_login(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<CompleteLogin>,
) -> Result<(), ApiError> {
    inner::complete_composio_login(req.cli_key)
        .await
        .map_err(map_complete_login_err)
}

async fn logout(State(_st): State<Arc<ServerState>>) -> Result<(), ApiError> {
    inner::logout_composio().await.map_err(lift)
}

async fn list_apps(State(_st): State<Arc<ServerState>>) -> Json<Vec<ComposioAppEntry>> {
    Json(inner::list_composio_apps().await)
}

async fn list_connections(State(_st): State<Arc<ServerState>>) -> Json<Vec<String>> {
    Json(inner::list_composio_connected_toolkits().await)
}

async fn connect_app(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<ConnectApp>,
) -> Result<Json<StartLinkResponse>, ApiError> {
    inner::connect_composio_app(req.toolkit)
        .await
        .map(Json)
        .map_err(map_start_link_err)
}

/// Map a connect failure to the wire error.
///
/// `AlreadyConnected` is an expected state — the toolkit is already linked,
/// so the CLI issued no new auth URL. It surfaces as a typed
/// `composio_already_connected` (HTTP 409) the frontend silences (no red bug
/// toast, no Sentry report) while it refreshes its connected-toolkits list so
/// the card flips to connected (HOU-463). Anything else is an internal fault
/// worth a bug report.
fn map_start_link_err(e: StartLinkError) -> ApiError {
    match e {
        StartLinkError::AlreadyConnected { .. } => ApiError(CoreError::Labeled {
            code: ErrorCode::Conflict,
            kind: "composio_already_connected",
            message: e.to_string(),
        }),
        StartLinkError::Other(detail) => ApiError(CoreError::Internal(detail)),
    }
}

/// Disconnect every connected account for a toolkit in the consumer
/// namespace. Returns 200 on success; errors surface as `ApiError`.
async fn disconnect_app(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<ToolkitRef>,
) -> Result<(), ApiError> {
    inner::disconnect_composio_app(req.toolkit).await.map_err(lift)
}

/// Reconnect (refresh auth on) a toolkit. Returns `{ redirectUrl }` — a
/// browser URL to complete OAuth re-consent, or `null` when the auth
/// scheme refreshed silently.
async fn reconnect_app(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<ToolkitRef>,
) -> Result<Json<ReconnectResponse>, ApiError> {
    inner::reconnect_composio_app(req.toolkit)
        .await
        .map(|redirect_url| Json(ReconnectResponse { redirect_url }))
        .map_err(lift)
}

/// Start an engine-side watch for `toolkit` to land in the consumer
/// connections list. Returns immediately; the watcher emits
/// `ComposioConnectionAdded` over the WS firehose when it sees the
/// slug appear (or self-cancels after a 5-minute deadline).
///
/// Idempotent: a second call for the same slug while a watch is
/// already running is a no-op. Safe to call from multiple frontends
/// (chat card, integrations tab) racing on the same connect.
async fn watch_connection(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<WatchConnection>,
) -> Result<(), ApiError> {
    let toolkit = req.toolkit.trim();
    if toolkit.is_empty() {
        return Err(lift("toolkit must not be empty".into()));
    }
    connection_watcher::watch(toolkit, Arc::new(st.events.clone()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeout_maps_to_typed_login_timeout() {
        let err = map_complete_login_err(CompleteLoginError::TimedOut).0;
        // Frontend matches on `kind` to render localized, retryable copy.
        assert_eq!(err.kind(), Some("composio_login_timeout"));
        assert_eq!(err.code(), ErrorCode::Unavailable);
        // The wire message must not carry the secret `--key` argv.
        assert!(!err.to_string().contains("--key"));
    }

    #[test]
    fn cli_failure_maps_to_internal_bug() {
        let err = map_complete_login_err(CompleteLoginError::Failed("boom".into())).0;
        assert_eq!(err.kind(), None);
        assert_eq!(err.code(), ErrorCode::Internal);
        assert_eq!(err.to_string(), "internal: boom");
    }
}
