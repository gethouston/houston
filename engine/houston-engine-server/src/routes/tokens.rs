//! `POST /v1/agents/{agent_path}/token` — mint an Airlock per-agent capability
//! token (L7). The returned `hsta_…` bearer grants access to *only* this agent;
//! see `crate::agent_scope`.
//!
//! Minting requires an unscoped (Full) caller — the bootstrap token or a paired
//! device. A scoped token must not be able to mint (and can't reach this route
//! anyway: the auth middleware fails it closed because the path isn't its
//! agent's `/sessions`).

use crate::agent_scope::{mint_agent_token, Scope};
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Extension, Json, Router,
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
struct MintedToken {
    token: String,
    agent_path: String,
}

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/:agent_path/token", post(mint))
}

async fn mint(
    State(state): State<Arc<ServerState>>,
    Extension(scope): Extension<Scope>,
    Path(agent_path): Path<String>,
) -> impl IntoResponse {
    if scope != Scope::Full {
        return StatusCode::FORBIDDEN.into_response();
    }
    let token = mint_agent_token(&state.config.token, &agent_path);
    Json(MintedToken { token, agent_path }).into_response()
}
