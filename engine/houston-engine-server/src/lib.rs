//! houston-engine-server — axum HTTP+WS server.
//!
//! Binary: `houston-engine`. Speaks `houston-engine-protocol` over HTTP and
//! WebSocket. Frontend-agnostic: every client (desktop, mobile, CLI,
//! third-party) talks to it over the wire.

pub mod auth;
pub mod config;
pub mod mobile_access;
pub mod routes;
pub mod state;
pub mod ws;

use axum::{http::HeaderValue, middleware, routing::get, Router};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

pub use config::ServerConfig;
pub use state::ServerState;

/// Build the full axum router for the engine.
pub fn build_router(state: Arc<ServerState>) -> Router {
    let v1 = Router::new()
        .route("/health", get(routes::health::health))
        .route("/version", get(routes::health::version))
        .route("/ws", get(ws::ws_upgrade))
        .merge(routes::workspaces::router())
        .merge(routes::preferences::router())
        .merge(routes::conversations::router())
        .merge(routes::providers::router())
        .merge(routes::agent_configs::router())
        .merge(routes::sessions::router())
        .merge(routes::skills::router())
        .merge(routes::attachments::router())
        .merge(routes::worktree::router())
        .merge(routes::store::router())
        .merge(routes::routines::router())
        .merge(routes::workflows::router())
        .merge(routes::agents::router())
        .merge(routes::agent_files::router())
        .merge(routes::composio::router())
        .merge(routes::claude::router())
        .merge(routes::tunnel::router())
        .merge(routes::watcher::router())
        .merge(routes::portable::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_bearer,
        ))
        .layer(middleware::from_fn(routes::version_header));

    Router::new()
        .nest("/v1", v1)
        .layer(
            // Permissive CORS for loopback dev — the webview (tauri://
            // localhost or http://localhost:1420 in dev) is cross-origin
            // to 127.0.0.1:<port>. Bearer tokens are not "credentials"
            // in CORS parlance, so wildcard + Any is safe here.
            CorsLayer::new()
                .allow_origin("*".parse::<HeaderValue>().unwrap())
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state)
}
