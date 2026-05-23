//! Background task internals — the OAuth dance + the per-workspace
//! inflight map.
//!
//! Pulled out of `commands.rs` to keep that file's public surface
//! under the 200-line budget. The split is by concern: `commands.rs`
//! is the API surface, `task.rs` is the runtime that fulfills it.

use crate::auth::{exchange_code, project_to_stored};
use crate::callback::run_callback_listener;
use crate::connection::ConnectionMeta;
use crate::error::LinearError;
use crate::queries::viewer;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::task::JoinHandle;

/// Five-minute timeout for the OAuth dance. Linear's consent pages
/// are usually instant; this caps the worst case where a user gets
/// distracted mid-flow.
pub(crate) const CONNECT_TIMEOUT: Duration = Duration::from_secs(300);

/// Process-wide reqwest client (connection-pooled).
pub(crate) fn http() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(reqwest::Client::new)
}

/// In-flight background task handles keyed by workspace path.
fn inflight() -> &'static Mutex<HashMap<PathBuf, JoinHandle<()>>> {
    static M: OnceLock<Mutex<HashMap<PathBuf, JoinHandle<()>>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn has_inflight(workspace_path: &Path) -> bool {
    inflight()
        .lock()
        .ok()
        .map(|m| m.contains_key(workspace_path))
        .unwrap_or(false)
}

pub(crate) fn cancel_inflight(workspace_path: &Path) {
    if let Ok(mut map) = inflight().lock() {
        if let Some(handle) = map.remove(workspace_path) {
            handle.abort();
        }
    }
}

pub(crate) fn register_inflight(workspace_path: PathBuf, handle: JoinHandle<()>) {
    if let Ok(mut map) = inflight().lock() {
        map.insert(workspace_path, handle);
    }
}

/// Run the full OAuth dance for `workspace_path`:
/// 1. Listen for Linear's redirect on the fixed callback port.
/// 2. Verify the CSRF state token matches what we recorded in
///    [`crate::pending::PendingStore`].
/// 3. Exchange the auth code for tokens.
/// 4. Pull org info via the cynic-typed viewer query.
/// 5. Persist tokens to keychain + `connection.json`.
///
/// Caller is responsible for taking the matching pending state and
/// supplying capability/scope arrays via `prepared`.
pub(crate) async fn run_connect_task(
    workspace_path: PathBuf,
    prepared: PreparedConnect,
) -> Result<(), LinearError> {
    let params = tokio::time::timeout(CONNECT_TIMEOUT, run_callback_listener())
        .await
        .map_err(|_| LinearError::Oauth("Linear OAuth timed out after 5 minutes".into()))??;

    let taken = crate::commands::pending().take(&workspace_path, &params.state)?;
    let token = exchange_code(
        http(),
        &taken.client_id,
        &taken.client_secret,
        &params.code,
        &taken.redirect_uri,
    )
    .await?;

    let org = viewer::fetch_org_info(http(), &token.access_token).await?;

    let stored = project_to_stored(&token, None);
    let meta = ConnectionMeta::from_oauth(
        "linear",
        org,
        stored,
        prepared.scopes,
        prepared.capabilities,
    )?;
    meta.write_atomic(&workspace_path)?;

    tracing::info!(
        workspace = %workspace_path.display(),
        org_id = %meta.org_id,
        org_name = %meta.org_name,
        "Linear connected"
    );

    if let Ok(mut map) = inflight().lock() {
        map.remove(&workspace_path);
    }
    Ok(())
}

/// Per-task inputs threaded through from [`crate::commands::start_connect`].
#[derive(Debug, Clone)]
pub(crate) struct PreparedConnect {
    pub scopes: Vec<String>,
    pub capabilities: Vec<String>,
}
