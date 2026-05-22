//! `/v1/agents/portable/*` and `/v1/store/imports/*` REST routes.

use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::paths::expand_tilde;
use houston_engine_core::portable::anonymize::{
    anonymize_agent, AnonymizeRequest, AnonymizeResponse,
};
use houston_engine_core::portable::export::{self, ExportRequest, InventoryPreview};
use houston_engine_core::portable::import::{
    self, InstallRequest, InstalledAgent, UploadPreviewResponse,
};
use houston_engine_core::portable::scan::{scan_package, ScanResponse};
use houston_engine_core::CoreError;
use houston_engine_protocol::ENGINE_VERSION;
use serde::Deserialize;
use std::path::PathBuf;

use crate::routes::error::ApiError;
use crate::state::ServerState;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/agents/portable/preview", get(preview))
        .route("/agents/portable/package", post(package))
        .route("/agents/portable/anonymize", post(anonymize))
        .route("/store/imports/preview", post(import_preview))
        .route("/store/imports/scan", post(import_scan))
        .route("/store/imports/install", post(import_install))
}

#[derive(Deserialize)]
struct AgentQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
}

#[derive(Deserialize)]
struct AnonymizeQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanRequest {
    package_id: String,
}

fn resolve_root(agent_path: &str) -> Result<PathBuf, CoreError> {
    if agent_path.trim().is_empty() {
        return Err(CoreError::BadRequest("agent_path is required".into()));
    }
    Ok(expand_tilde(std::path::Path::new(agent_path)))
}

// ── Export side ─────────────────────────────────────────────────────────

async fn preview(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<InventoryPreview>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let inventory = export::gather_inventory(&root)?;
    Ok(Json(export::build_preview(&inventory)))
}

async fn package(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(req): Json<ExportRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let bytes = export::build_package(&root, ENGINE_VERSION, req)?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/zip"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"agent.houstonagent\"",
            ),
        ],
        bytes,
    ))
}

async fn anonymize(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AnonymizeQuery>,
    Json(req): Json<AnonymizeRequest>,
) -> Result<Json<AnonymizeResponse>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(anonymize_agent(&root, req)?))
}

// ── Import side ─────────────────────────────────────────────────────────

async fn import_preview(
    State(_st): State<Arc<ServerState>>,
    body: Bytes,
) -> Result<Json<UploadPreviewResponse>, ApiError> {
    if body.is_empty() {
        return Err(ApiError::from(CoreError::BadRequest("empty upload".into())));
    }
    Ok(Json(import::register_upload(&body)?))
}

async fn import_scan(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<ScanRequest>,
) -> Result<Json<ScanResponse>, ApiError> {
    Ok(Json(scan_package(&req.package_id)?))
}

async fn import_install(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<InstallRequest>,
) -> Result<Json<InstalledAgent>, ApiError> {
    let installed = import::install(&st.config.docs_dir, req)?;
    // The frontend's React Query invalidation on the install mutation
    // refreshes the workspace agent list immediately; no dedicated
    // event variant exists for "agents in workspace changed" yet.
    Ok(Json(installed))
}
