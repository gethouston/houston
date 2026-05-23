//! `/v1/git/*` REST routes — read-only inspection of an arbitrary cwd.
//!
//! All handlers are thin wrappers over `houston_engine_core::git`. Caller
//! supplies the `cwd`; the engine does NOT know which agent / mission /
//! worktree the path belongs to (that decision lives in the frontend).
//!
//! Enforcement surface: engine routes are always on (per RFC #248's
//! split table). UI-side gating happens via `advanced.git_panel`.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use houston_engine_core::git::{
    self, GitDiffRequest, GitDiffResponse, GitLogRequest, GitLogResponse, GitStatusRequest,
    GitStatusResponse,
};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/git/status", post(status))
        .route("/git/log", post(log))
        .route("/git/diff", post(diff))
}

async fn status(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<GitStatusRequest>,
) -> Result<Json<GitStatusResponse>, ApiError> {
    Ok(Json(git::status(req).await?))
}

async fn log(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<GitLogRequest>,
) -> Result<Json<GitLogResponse>, ApiError> {
    Ok(Json(git::log(req).await?))
}

async fn diff(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<GitDiffRequest>,
) -> Result<Json<GitDiffResponse>, ApiError> {
    Ok(Json(git::diff(req).await?))
}
