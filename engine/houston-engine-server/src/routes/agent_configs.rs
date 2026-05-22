//! `/v1/agent-configs` REST route.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::get, Json, Router};
use houston_engine_core::agent_configs::{self, InstalledConfig};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agent-configs", get(list))
}

async fn list(State(st): State<Arc<ServerState>>) -> Result<Json<Vec<InstalledConfig>>, ApiError> {
    Ok(Json(agent_configs::list_installed(st.engine.paths.home())?))
}
