//! `/v1/timeline` — cross-session activity timeline. Phase 4 of RFC #248
//! (`advanced.timeline`). Engine routes are always-on; UI gating happens
//! in the frontend.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use houston_engine_core::timeline::{self, TimelineRequest, TimelineResponse};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/timeline", post(get_timeline))
}

async fn get_timeline(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<TimelineRequest>,
) -> Result<Json<TimelineResponse>, ApiError> {
    Ok(Json(timeline::timeline(&st.engine, req).await?))
}
