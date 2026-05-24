//! `/v1/checkpoints/*` — agent `.houston` snapshot + restore. Phase 5 of
//! RFC #248 (`advanced.checkpoints`). Routes always-on; UI gating
//! happens in the frontend.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use houston_engine_core::checkpoints::{
    self, Checkpoint, CheckpointListResponse, CreateCheckpointRequest, DeleteCheckpointRequest,
    ListCheckpointsRequest, RestoreCheckpointRequest,
};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/checkpoints", post(create))
        .route("/checkpoints/list", post(list))
        .route("/checkpoints/restore", post(restore))
        .route("/checkpoints/delete", post(delete))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<CreateCheckpointRequest>,
) -> Result<Json<Checkpoint>, ApiError> {
    Ok(Json(
        checkpoints::create(st.engine.paths.home(), req).await?,
    ))
}

async fn list(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<ListCheckpointsRequest>,
) -> Result<Json<CheckpointListResponse>, ApiError> {
    Ok(Json(checkpoints::list(st.engine.paths.home(), req).await?))
}

async fn restore(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<RestoreCheckpointRequest>,
) -> Result<Json<()>, ApiError> {
    checkpoints::restore(st.engine.paths.home(), req).await?;
    Ok(Json(()))
}

async fn delete(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<DeleteCheckpointRequest>,
) -> Result<Json<()>, ApiError> {
    checkpoints::delete(st.engine.paths.home(), req).await?;
    Ok(Json(()))
}
