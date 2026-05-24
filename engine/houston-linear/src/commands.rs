//! Transport-neutral command API.
//!
//! Engine-server routes (`routes/trackers.rs`) and any other client
//! (CLI, tests, future Tauri commands) call into these functions —
//! they never touch the underlying modules directly. Keeps the wire
//! contract in one place.
//!
//! ## Background task lifecycle
//!
//! [`start_connect`] returns immediately with the authorize URL. The
//! OAuth dance (callback listener + token exchange + viewer query +
//! `connection.json` write) runs in a `tokio::spawn`-ed background
//! task — implemented in [`task`]. The caller polls [`get_status`]
//! to detect completion.
//!
//! Re-clicking "Connect" while a previous attempt is in flight cancels
//! the old task (releasing the callback port) and spawns a fresh one.

mod issues;
mod task;
mod webhook;

pub use issues::{list_issues, sync_now};
pub use webhook::{handle_delivery, WebhookOutcome};

use crate::auth::{build_authorize_url, LINEAR_OAUTH_CALLBACK_PORT, LINEAR_OAUTH_REDIRECT_URI};
use crate::connection::ConnectionMeta;
use crate::error::LinearError;
use crate::pending::PendingStore;
use houston_engine_protocol::{
    TrackerConnectResponse, TrackerConnectionState, TrackerProvider, TrackerStatusResponse,
};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// OAuth scopes Houston requests at install.
pub const REQUIRED_SCOPES: &[&str] = &[
    "read",
    "write",
    "app:assignable",
    "app:mentionable",
    "webhook:write",
];

/// Capabilities the engine declares on a freshly-connected Linear org.
/// Mirrors the `capabilities` array in `tracker_connection.schema.json`.
const LINEAR_CAPABILITIES: &[&str] = &[
    "issues",
    "projects",
    "initiatives",
    "cycles",
    "milestones",
    "subtasks",
    "webhooks",
    "agent_session",
];

/// Process-wide pending-state store (shared between
/// [`start_connect`] and the background [`task::run_connect_task`]).
pub(crate) fn pending() -> &'static PendingStore {
    static P: OnceLock<PendingStore> = OnceLock::new();
    P.get_or_init(PendingStore::new)
}

/// Start the OAuth flow for `workspace_path`. Returns the authorize
/// URL the caller should open in the default browser. The background
/// task completes asynchronously; caller polls [`get_status`].
pub async fn start_connect(
    workspace_path: PathBuf,
    client_id: String,
    client_secret: String,
) -> Result<TrackerConnectResponse, LinearError> {
    let state = uuid::Uuid::new_v4().to_string();
    let redirect_uri = LINEAR_OAUTH_REDIRECT_URI.to_string();
    let url = build_authorize_url(&client_id, &redirect_uri, &state, REQUIRED_SCOPES)?;

    pending().start(
        &workspace_path,
        state.clone(),
        client_id,
        client_secret,
        redirect_uri,
    );

    // Cancel any prior in-flight task for this workspace so it
    // releases the callback port before we spawn the new one.
    task::cancel_inflight(&workspace_path);

    let prepared = task::PreparedConnect {
        scopes: REQUIRED_SCOPES.iter().map(|s| s.to_string()).collect(),
        capabilities: LINEAR_CAPABILITIES.iter().map(|s| s.to_string()).collect(),
    };
    let ws = workspace_path.clone();
    let handle = tokio::spawn(async move {
        if let Err(e) = task::run_connect_task(ws.clone(), prepared).await {
            tracing::error!(
                workspace = %ws.display(),
                error = %e,
                "Linear OAuth connect task failed"
            );
        }
    });
    task::register_inflight(workspace_path, handle);

    Ok(TrackerConnectResponse {
        provider: TrackerProvider::Linear,
        authorize_url: url.to_string(),
        state,
        callback_port: LINEAR_OAUTH_CALLBACK_PORT,
    })
}

/// Read the current connection state for `workspace_path` from
/// `connection.json`. Read-only — does not touch the network or
/// keychain.
pub fn get_status(workspace_path: &Path) -> TrackerStatusResponse {
    let has_inflight = task::has_inflight(workspace_path);
    match ConnectionMeta::load(workspace_path) {
        Ok(meta) => TrackerStatusResponse {
            provider: TrackerProvider::Linear,
            connected: true,
            state: TrackerConnectionState::Connected,
            org_id: Some(meta.org_id),
            org_name: Some(meta.org_name),
            capabilities: meta.capabilities,
            connected_at: Some(meta.connected_at),
            last_sync_at: meta.last_sync_at,
            last_error: None,
        },
        Err(LinearError::NotAuthenticated) => TrackerStatusResponse {
            provider: TrackerProvider::Linear,
            connected: false,
            state: if has_inflight {
                TrackerConnectionState::Connecting
            } else {
                TrackerConnectionState::NotConnected
            },
            org_id: None,
            org_name: None,
            capabilities: vec![],
            connected_at: None,
            last_sync_at: None,
            last_error: None,
        },
        Err(e) => TrackerStatusResponse {
            provider: TrackerProvider::Linear,
            connected: false,
            state: TrackerConnectionState::Error,
            org_id: None,
            org_name: None,
            capabilities: vec![],
            connected_at: None,
            last_sync_at: None,
            last_error: Some(format!("{e}")),
        },
    }
}

/// Disconnect: cancel any in-flight task, remove the keychain entry,
/// delete `connection.json`. Idempotent — calling on an unconnected
/// workspace returns Ok.
pub fn disconnect(workspace_path: &Path) -> Result<(), LinearError> {
    task::cancel_inflight(workspace_path);

    if let Ok(meta) = ConnectionMeta::load(workspace_path) {
        // Remove the keychain entry for this org before deleting
        // connection.json — order matters so a partial failure
        // leaves us with no dangling token.
        crate::keychain::delete(&meta.org_id)?;
    }

    let path = ConnectionMeta::path_for(workspace_path);
    match std::fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(LinearError::Io(format!("delete connection.json: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn status_for_unconnected_workspace_is_not_connected() {
        let dir = TempDir::new().unwrap();
        let status = get_status(dir.path());
        assert_eq!(status.provider, TrackerProvider::Linear);
        assert!(!status.connected);
        assert_eq!(status.state, TrackerConnectionState::NotConnected);
        assert!(status.org_id.is_none());
    }

    #[test]
    fn capabilities_include_agent_session() {
        assert!(LINEAR_CAPABILITIES.contains(&"agent_session"));
        assert!(LINEAR_CAPABILITIES.contains(&"issues"));
        assert!(LINEAR_CAPABILITIES.contains(&"webhooks"));
    }

    #[test]
    fn required_scopes_match_capability_set() {
        // The agent_session capability requires app:assignable +
        // app:mentionable scopes. If the capability is declared, the
        // scopes must back it.
        let has_agent_session = LINEAR_CAPABILITIES.contains(&"agent_session");
        if has_agent_session {
            assert!(REQUIRED_SCOPES.contains(&"app:assignable"));
            assert!(REQUIRED_SCOPES.contains(&"app:mentionable"));
        }
    }

    #[test]
    fn disconnect_on_unconnected_workspace_is_idempotent() {
        let dir = TempDir::new().unwrap();
        disconnect(dir.path()).unwrap();
    }
}
