//! `/v1/trackers/:provider/*` REST routes.
//!
//! Thin proxies over `houston_linear::commands`. V1 only accepts
//! `provider=linear`; unknown providers return 400. Adding tracker #2
//! is a new concrete crate + a new arm in the dispatch — no URL or
//! handler-signature migration.
//!
//! Spec contract: docs/specs/2026-05-23-tracker-integration.html
//! KB reference: knowledge-base/tracker-integration.md

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::CoreError;
use houston_engine_protocol::{
    TrackerConnectRequest, TrackerConnectResponse, TrackerProvider, TrackerStatusResponse,
};
use houston_linear::commands as linear;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route(
            "/trackers/:provider/connect",
            post(connect).delete(disconnect),
        )
        .route("/trackers/:provider/status", get(status))
}

fn bad(message: impl Into<String>) -> ApiError {
    ApiError(CoreError::BadRequest(message.into()))
}

fn lift_linear(err: houston_linear::LinearError) -> ApiError {
    ApiError(CoreError::Internal(format!("{err}")))
}

fn parse_provider(path_str: &str) -> Result<TrackerProvider, ApiError> {
    TrackerProvider::from_path_str(path_str)
        .ok_or_else(|| bad(format!("unknown tracker provider: {path_str}")))
}

/// `POST /v1/trackers/:provider/connect` — start the OAuth flow.
///
/// Body carries the workspace path and optionally an explicit OAuth
/// `client_id` / `client_secret` (dev fallback when env vars aren't
/// set). Returns the authorize URL the caller should open in the
/// user's default browser.
async fn connect(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    Json(req): Json<TrackerConnectRequest>,
) -> Result<Json<TrackerConnectResponse>, ApiError> {
    let prov = parse_provider(&provider)?;
    if !matches!(prov, TrackerProvider::Linear) {
        return Err(bad(format!(
            "provider {provider} is declared but no engine crate is wired yet"
        )));
    }

    let workspace = PathBuf::from(&req.workspace_path);
    if !workspace.is_absolute() {
        return Err(bad("workspacePath must be absolute"));
    }

    let client_id = req
        .client_id
        .or_else(|| std::env::var("LINEAR_CLIENT_ID").ok())
        .ok_or_else(|| bad("LINEAR_CLIENT_ID not set and clientId not provided"))?;
    let client_secret = req
        .client_secret
        .or_else(|| std::env::var("LINEAR_CLIENT_SECRET").ok())
        .ok_or_else(|| bad("LINEAR_CLIENT_SECRET not set and clientSecret not provided"))?;

    let resp = linear::start_connect(workspace, client_id, client_secret)
        .await
        .map_err(lift_linear)?;
    Ok(Json(resp))
}

/// `DELETE /v1/trackers/:provider/connect` — disconnect.
async fn disconnect(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<(), ApiError> {
    let prov = parse_provider(&provider)?;
    if !matches!(prov, TrackerProvider::Linear) {
        return Err(bad(format!("provider {provider} not supported")));
    }
    let workspace = PathBuf::from(&q.workspace_path);
    if !workspace.is_absolute() {
        return Err(bad("workspacePath must be absolute"));
    }
    linear::disconnect(&workspace).map_err(lift_linear)?;
    Ok(())
}

/// `GET /v1/trackers/:provider/status?workspacePath=...`
async fn status(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<Json<TrackerStatusResponse>, ApiError> {
    let prov = parse_provider(&provider)?;
    if !matches!(prov, TrackerProvider::Linear) {
        return Err(bad(format!("provider {provider} not supported")));
    }
    let workspace = PathBuf::from(&q.workspace_path);
    if !workspace.is_absolute() {
        return Err(bad("workspacePath must be absolute"));
    }
    Ok(Json(linear::get_status(&workspace)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceQuery {
    workspace_path: String,
}
