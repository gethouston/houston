//! `/v1/agents/audit` REST route for per-session agent audit logs.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use houston_engine_core::paths::expand_tilde;
use houston_engine_core::CoreError;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/audit", get(read))
}

#[derive(Deserialize)]
pub struct AuditQuery {
    pub agent_path: String,
    pub session_key: String,
}

fn resolve_root(agent_path: &str) -> Result<PathBuf, CoreError> {
    if agent_path.trim().is_empty() {
        return Err(CoreError::BadRequest("agent_path is required".into()));
    }
    Ok(expand_tilde(std::path::Path::new(agent_path)))
}

async fn read(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Vec<Value>>, ApiError> {
    if q.session_key.trim().is_empty() {
        return Err(CoreError::BadRequest("session_key is required".into()).into());
    }
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(houston_engine_core::agent_audit::read_session(
        &root,
        &q.session_key,
    )?))
}
