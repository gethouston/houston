//! REST routes.

pub mod agent_configs;
pub mod agent_files;
pub mod agents;
pub mod attachments;
pub mod claude;
pub mod composio;
pub mod conversations;
pub mod error;
pub mod git;
pub mod health;
pub mod portable;
pub mod preferences;
pub mod providers;
pub mod routines;
pub mod sessions;
pub mod skills;
pub mod store;
pub mod tunnel;
pub mod watcher;
pub mod worktree;
pub mod workspaces;

use axum::{extract::Request, http::HeaderValue, middleware::Next, response::Response};
use houston_engine_protocol::{ENGINE_VERSION, HEADER_ENGINE_VERSION};

/// Inject `X-Houston-Engine-Version` on every response.
pub async fn version_header(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    if let Ok(v) = HeaderValue::from_str(ENGINE_VERSION) {
        res.headers_mut().insert(HEADER_ENGINE_VERSION, v);
    }
    res
}
