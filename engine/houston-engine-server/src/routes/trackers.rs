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
    body::Bytes,
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::CoreError;
use houston_engine_protocol::{
    TrackerConnectRequest, TrackerConnectResponse, TrackerIssue, TrackerProvider,
    TrackerReconcileResponse, TrackerStatusResponse, TrackerWebhookResponse,
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
        .route("/trackers/:provider/issues", get(issues))
        .route("/trackers/:provider/sync", post(sync_now))
        .route("/trackers/:provider/webhook", post(webhook))
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

/// Validate that the path provider is `linear` and the workspace path
/// is absolute. Returns the parsed [`PathBuf`] so handlers don't
/// repeat the check.
fn require_linear_workspace(provider: &str, ws: &str) -> Result<PathBuf, ApiError> {
    let prov = parse_provider(provider)?;
    if !matches!(prov, TrackerProvider::Linear) {
        return Err(bad(format!(
            "provider {provider} is declared but no engine crate is wired yet"
        )));
    }
    let workspace = PathBuf::from(ws);
    if !workspace.is_absolute() {
        return Err(bad("workspacePath must be absolute"));
    }
    Ok(workspace)
}

/// `POST /v1/trackers/:provider/connect` — start the OAuth flow.
async fn connect(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    Json(req): Json<TrackerConnectRequest>,
) -> Result<Json<TrackerConnectResponse>, ApiError> {
    let workspace = require_linear_workspace(&provider, &req.workspace_path)?;

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
    let workspace = require_linear_workspace(&provider, &q.workspace_path)?;
    linear::disconnect(&workspace).map_err(lift_linear)?;
    Ok(())
}

/// `GET /v1/trackers/:provider/status?workspacePath=...`
async fn status(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<Json<TrackerStatusResponse>, ApiError> {
    let workspace = require_linear_workspace(&provider, &q.workspace_path)?;
    Ok(Json(linear::get_status(&workspace)))
}

/// `GET /v1/trackers/:provider/issues?workspacePath=...` — read the
/// on-disk projection. Returns `[]` when the workspace is not yet
/// connected (per the no-silent-failures policy callers that need to
/// distinguish "empty" from "disconnected" hit `/status` first).
async fn issues(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<Json<Vec<TrackerIssue>>, ApiError> {
    let workspace = require_linear_workspace(&provider, &q.workspace_path)?;
    let items = linear::list_issues(&workspace).map_err(lift_linear)?;
    Ok(Json(items))
}

/// `POST /v1/trackers/:provider/sync?workspacePath=...` — manual
/// reconcile trigger.
async fn sync_now(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<Json<TrackerReconcileResponse>, ApiError> {
    let workspace = require_linear_workspace(&provider, &q.workspace_path)?;
    let resp = linear::sync_now(&workspace).await.map_err(lift_linear)?;
    Ok(Json(resp))
}

/// `POST /v1/trackers/:provider/webhook?workspacePath=...` — ingest a
/// Linear webhook delivery.
///
/// Always responds 200 (Linear's webhook spec requires 2xx for "don't
/// retry"). Signature/replay failures are surfaced in the response body
/// and logged engine-side — Linear sees 200 either way.
///
/// In production the relay (`houston-relay`, C11) translates
/// `tunnel_id` → `workspacePath` before forwarding here. For dev /
/// localhost testing the caller passes `workspacePath` directly.
async fn webhook(
    State(_st): State<Arc<ServerState>>,
    Path(provider): Path<String>,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<TrackerWebhookResponse>, ApiError> {
    let workspace = require_linear_workspace(&provider, &q.workspace_path)?;

    let sig = headers
        .get(houston_linear::LINEAR_SIGNATURE_HEADER)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            bad(format!(
                "missing {} header",
                houston_linear::LINEAR_SIGNATURE_HEADER
            ))
        })?;
    let ts = headers
        .get(houston_linear::LINEAR_TIMESTAMP_HEADER)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            bad(format!(
                "missing {} header",
                houston_linear::LINEAR_TIMESTAMP_HEADER
            ))
        })?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    match linear::handle_delivery(&workspace, &body, sig, ts, now_ms) {
        Ok(linear::WebhookOutcome::Accepted { event_type, action }) => {
            Ok(Json(TrackerWebhookResponse::Accepted {
                event_type,
                action,
            }))
        }
        Ok(linear::WebhookOutcome::Duplicate) => Ok(Json(TrackerWebhookResponse::Duplicate)),
        Err(houston_linear::LinearError::WebhookSignature) => {
            tracing::warn!(target: "tracker.webhook", provider = %provider, "signature verification failed");
            Ok(Json(TrackerWebhookResponse::BadSignature))
        }
        Err(houston_linear::LinearError::WebhookReplay) => {
            tracing::warn!(target: "tracker.webhook", provider = %provider, "replay window exceeded");
            Ok(Json(TrackerWebhookResponse::ReplayWindowExceeded))
        }
        Err(e) => Err(lift_linear(e)),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceQuery {
    workspace_path: String,
}
