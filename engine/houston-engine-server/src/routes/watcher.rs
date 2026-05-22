//! `/v1/watcher/*` — agent filesystem watcher lifecycle.
//!
//! Starts a `houston-file-watcher` instance over the agent directory; change
//! events flow into the engine's event sink as `HoustonEvent` variants and
//! fan out to subscribed WS clients. The server holds a single active
//! watcher — switching agents stops the previous one.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use houston_engine_core::CoreError;
use houston_file_watcher::start_watching;
use serde::Deserialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/watcher/start", post(start))
        .route("/watcher/stop", post(stop))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    pub agent_path: String,
}

async fn start(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<StartRequest>,
) -> Result<(), ApiError> {
    let mut guard = st.watcher.0.lock().await;
    *guard = None; // stop any existing watcher
    let watcher =
        start_watching(st.engine.events.clone(), req.agent_path).map_err(CoreError::Internal)?;
    *guard = Some(watcher);
    Ok(())
}

async fn stop(State(st): State<Arc<ServerState>>) -> Result<(), ApiError> {
    let mut guard = st.watcher.0.lock().await;
    *guard = None;
    Ok(())
}
