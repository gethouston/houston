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
use houston_composio::cli::{ComposioStatus, StartLinkResponse, StartLoginResponse};
use houston_composio::commands as inner;
use houston_composio::connection_watcher;
use houston_composio::recommender::{self, RecommendError, RecommendResult};
use houston_engine_core::CoreError;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/composio/status", get(status))
        .route("/composio/cli-installed", get(cli_installed))
        .route("/composio/cli", post(install_cli))
        .route("/composio/login", post(start_login))
        .route("/composio/login/complete", post(complete_login))
        .route("/composio/apps", get(list_apps))
        .route(
            "/composio/connections",
            get(list_connections).post(connect_app),
        )
        .route("/composio/connections/watch", post(watch_connection))
        .route("/composio/recommend", post(recommend_stack))
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
struct WatchConnection {
    toolkit: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecommendStackRequest {
    intent: String,
    #[serde(default)]
    already_connected: Vec<String>,
    /// Provider hint. Defaults to Anthropic. Accepts "anthropic" /
    /// "claude" / "openai" / "codex". Frontend should pass the
    /// workspace's configured provider so the LLM pick step uses the
    /// CLI the user has already logged into.
    #[serde(default)]
    provider: Option<String>,
}

fn lift(e: String) -> ApiError {
    ApiError(CoreError::Internal(e))
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
        .map_err(lift)
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

/// Recommend a Composio toolkit stack for a user's plain-language goal.
///
/// Body: `{ intent: string, alreadyConnected: string[], provider?: "anthropic"|"openai" }`.
/// Returns a `RecommendResult` (see `houston_composio::recommender::types`).
/// Errors map cleanly: empty intent → 400, catalog not enriched → 503,
/// no candidates matched → 404.
async fn recommend_stack(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<RecommendStackRequest>,
) -> Result<Json<RecommendResult>, ApiError> {
    let provider = req
        .provider
        .as_deref()
        .and_then(|s| Provider::from_str(s).ok())
        .unwrap_or_default();

    match recommender::recommend(&req.intent, &req.already_connected, provider).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Err(map_recommend_error(e)),
    }
}

fn map_recommend_error(e: RecommendError) -> ApiError {
    match e {
        RecommendError::EmptyIntent => {
            ApiError(CoreError::BadRequest("intent must not be empty".into()))
        }
        RecommendError::CatalogEmpty => ApiError(CoreError::Unavailable(
            "catalog not yet enriched — engine binary missing data/catalog-enriched.json contents"
                .into(),
        )),
        RecommendError::NoMatches => {
            ApiError(CoreError::NotFound("no toolkits matched the intent".into()))
        }
    }
}
