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

mod agent_session;
mod issues;
mod task;
mod webhook;

pub use agent_session::{dispatch_from_webhook, emit_activity};
pub use issues::{list_issues, list_issues_for_org, sync_now, sync_now_for_org};
pub use webhook::{handle_delivery, WebhookOutcome};

use crate::auth::{build_authorize_url, LINEAR_OAUTH_CALLBACK_PORT, LINEAR_OAUTH_REDIRECT_URI};
use crate::connection::ConnectionMeta;
use crate::error::LinearError;
use crate::pending::PendingStore;
use houston_engine_protocol::{
    TrackerConnectResponse, TrackerConnectionList, TrackerConnectionListItem,
    TrackerConnectionState, TrackerProvider, TrackerStatusResponse,
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

/// List every Linear connection registered to a workspace (post-PR-A
/// workspace-many surface). On first call after upgrading from the
/// pre-PR-A per-agent layout, transparently migrates any per-agent
/// connections under the workspace into the new
/// `<workspace>/.houston/trackers/linear/connections/<org_id>.json`
/// layout. Source files are left intact for rollback safety until a
/// follow-up cleanup PR.
///
/// Returns an empty list when neither layout has any connections.
pub fn list_workspace_connections(
    workspace_path: &Path,
) -> Result<TrackerConnectionList, LinearError> {
    let metas = ConnectionMeta::list_for_workspace(workspace_path)?;
    let connections = metas
        .into_iter()
        .map(|m| TrackerConnectionListItem {
            org_id: m.org_id,
            org_name: m.org_name,
            app_user_id: m.app_user_id,
            capabilities: m.capabilities,
            connected_at: m.connected_at,
            last_sync_at: m.last_sync_at,
        })
        .collect();
    Ok(TrackerConnectionList {
        provider: TrackerProvider::Linear,
        connections,
    })
}

/// Per-org disconnect (PR C, workspace-many surface): removes the
/// keychain entry for `org_id` and deletes the workspace-level
/// `<workspace>/.houston/trackers/linear/connections/<org_id>.json`
/// file. Idempotent — calling on an absent org returns Ok.
///
/// Legacy per-agent files at
/// `<agent>/.houston/trackers/linear/connection.json` are NOT touched
/// here; the workspace-level migration runs lazily on the next
/// `list_workspace_connections` call. PR D will clean those up
/// after the new shape has soaked.
pub fn disconnect_for_org(workspace_path: &Path, org_id: &str) -> Result<(), LinearError> {
    // Only touch the keychain when the on-disk meta actually exists.
    // Mirrors the legacy `disconnect` pattern: keychain ops are
    // platform-bound (macOS `security` binary) and would fail
    // spuriously on CI / Linux dev shells if we always called them.
    // The "no meta on disk" branch is the idempotent-disconnect path
    // used by tests + duplicate user clicks.
    let meta_path = ConnectionMeta::path_for_workspace_org(workspace_path, org_id);
    if meta_path.exists() {
        // Keychain removed FIRST so a partial failure leaves no
        // dangling token even if the FS delete errors out.
        crate::keychain::delete(org_id)?;
    }

    match std::fs::remove_file(&meta_path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(LinearError::Io(format!("delete {org_id}.json: {e}"))),
    }
}

/// Per-org status (PR C, workspace-many surface): reads the
/// workspace-level `<org_id>.json` connection file. Returns a
/// fully-populated [`TrackerStatusResponse`] when the connection
/// exists, otherwise a `NotConnected` shape so callers can render
/// "this org is gone" without special-casing missing files.
pub fn get_status_for_org(workspace_path: &Path, org_id: &str) -> TrackerStatusResponse {
    match ConnectionMeta::load_for_workspace_org(workspace_path, org_id) {
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
            state: TrackerConnectionState::NotConnected,
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

    // ── PR C: per-org workspace-many surface ─────────────────────

    #[test]
    fn status_for_missing_org_is_not_connected() {
        let dir = TempDir::new().unwrap();
        let s = get_status_for_org(dir.path(), "absent-org");
        assert!(!s.connected);
        assert_eq!(s.state, TrackerConnectionState::NotConnected);
        assert!(s.last_error.is_none());
    }

    #[test]
    fn disconnect_for_missing_org_is_idempotent() {
        // No file, no keychain entry — should not blow up.
        let dir = TempDir::new().unwrap();
        disconnect_for_org(dir.path(), "absent-org").unwrap();
    }
}
