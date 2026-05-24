//! Connection metadata — persisted to
//! `.houston/trackers/linear/connection.json` per workspace.
//!
//! Mirrors `ui/agent-schemas/src/tracker_connection.schema.json` —
//! schema is the source of truth; this is the wire shape Rust reads
//! and writes. Token material itself lives in the macOS keychain
//! ([`crate::keychain`]); only opaque refs (`keychain:<org_id>:...`)
//! persist on disk.

use crate::error::LinearError;
use crate::keychain::{self, StoredTokens};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Connection metadata persisted to `connection.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ConnectionMeta {
    pub provider: String,
    pub org_id: String,
    pub org_name: String,
    pub app_user_id: Option<String>,
    pub capabilities: Vec<String>,
    pub oauth_access_token_ref: Option<String>,
    pub oauth_refresh_token_ref: Option<String>,
    pub oauth_token_expires_at: Option<String>,
    pub webhook_secret_ref: Option<String>,
    pub scopes: Vec<String>,
    pub connected_at: String,
    pub last_sync_at: Option<String>,
}

/// Minimal organization info needed at connect time. Populated either
/// from Linear's token-exchange response (when it includes it) or via
/// the viewer query in [`crate::queries::viewer`].
#[derive(Debug, Clone)]
pub struct OrgInfo {
    pub org_id: String,
    pub org_name: String,
    pub app_user_id: Option<String>,
}

impl ConnectionMeta {
    /// Build a fresh `ConnectionMeta` from a successful OAuth + a
    /// resolved [`OrgInfo`]. Persists tokens to keychain as a side
    /// effect; on disk we keep only opaque keychain refs.
    pub fn from_oauth(
        provider: &str,
        org: OrgInfo,
        tokens: StoredTokens,
        scopes: Vec<String>,
        capabilities: Vec<String>,
    ) -> Result<Self, LinearError> {
        let expires_iso = tokens.expires_at.map(unix_to_iso);
        keychain::store(&org.org_id, &tokens)?;

        Ok(Self {
            provider: provider.to_string(),
            org_id: org.org_id.clone(),
            org_name: org.org_name,
            app_user_id: org.app_user_id,
            capabilities,
            oauth_access_token_ref: Some(format!("keychain:{}:access", org.org_id)),
            oauth_refresh_token_ref: tokens
                .refresh_token
                .as_ref()
                .map(|_| format!("keychain:{}:refresh", org.org_id)),
            oauth_token_expires_at: expires_iso,
            webhook_secret_ref: tokens
                .webhook_secret
                .as_ref()
                .map(|_| format!("keychain:{}:webhook", org.org_id)),
            scopes,
            connected_at: now_iso(),
            last_sync_at: None,
        })
    }

    /// Compute the on-disk path for `connection.json` under a given
    /// workspace root.
    pub fn path_for(workspace_path: &Path) -> PathBuf {
        workspace_path
            .join(".houston")
            .join("trackers")
            .join("linear")
            .join("connection.json")
    }

    /// Write atomically (temp + rename). Caller ensures the parent
    /// directory hierarchy exists (created here on first write).
    pub fn write_atomic(&self, workspace_path: &Path) -> Result<(), LinearError> {
        let path = Self::path_for(workspace_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| LinearError::Io(format!("create connection dir: {e}")))?;
        }
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self).map_err(LinearError::Json)?;
        std::fs::write(&tmp, json)
            .map_err(|e| LinearError::Io(format!("write connection.json: {e}")))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| LinearError::Io(format!("rename connection.json: {e}")))?;
        Ok(())
    }

    /// Load from disk. Returns [`LinearError::NotAuthenticated`] when
    /// the file is missing (typical for never-connected workspaces).
    pub fn load(workspace_path: &Path) -> Result<Self, LinearError> {
        let path = Self::path_for(workspace_path);
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(LinearError::NotAuthenticated);
            }
            Err(e) => {
                return Err(LinearError::Io(format!("read connection.json: {e}")));
            }
        };
        serde_json::from_slice(&bytes).map_err(LinearError::Json)
    }
}

/// Seed the on-disk mirror layout under `<workspace>/.houston/trackers/linear/`.
///
/// Idempotent: dir creation + empty-array projection files only get
/// written if absent. Safe to call from `from_oauth` AND from any
/// later reconcile that finds the dirs missing.
///
/// Layout:
/// ```text
/// .houston/trackers/linear/
///   connection.json                    (written separately by ConnectionMeta::write_atomic)
///   raw/
///     issues/                          provider-fidelity per-entity JSONs (written by reconcile)
///     projects/
///     initiatives/
///     cycles/
///     webhook_events.jsonl             append-only event ledger
///   issues.json                        projection — array (seeded as [])
///   projects.json                      projection — array (seeded as [])
///   initiatives.json                   projection — array (seeded as [])
///   cycles.json                        projection — array (seeded as [])
///   agent_sessions/                    per-session thread state (created on demand)
///   sync_state.json                    polling cursors (seeded by SyncState::save_atomic)
/// ```
pub fn seed_layout(workspace_path: &Path) -> Result<(), LinearError> {
    let root = workspace_path
        .join(".houston")
        .join("trackers")
        .join("linear");

    // Directories — idempotent.
    for sub in [
        "raw/issues",
        "raw/projects",
        "raw/initiatives",
        "raw/cycles",
        "agent_sessions",
    ] {
        std::fs::create_dir_all(root.join(sub))
            .map_err(|e| LinearError::Io(format!("create {sub}: {e}")))?;
    }

    // Append-only event ledger — touch if missing.
    let events_log = root.join("raw").join("webhook_events.jsonl");
    if !events_log.exists() {
        std::fs::write(&events_log, b"")
            .map_err(|e| LinearError::Io(format!("touch webhook_events.jsonl: {e}")))?;
    }

    // Empty-array projection files — seed if absent.
    for name in [
        "issues.json",
        "projects.json",
        "initiatives.json",
        "cycles.json",
    ] {
        let path = root.join(name);
        if !path.exists() {
            std::fs::write(&path, b"[]")
                .map_err(|e| LinearError::Io(format!("seed {name}: {e}")))?;
        }
    }

    Ok(())
}

// -- time helpers --

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn unix_to_iso(unix_secs: u64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(unix_secs as i64, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn connection_meta_path_layout() {
        let path = ConnectionMeta::path_for(Path::new("/tmp/Agent"));
        assert_eq!(
            path,
            PathBuf::from("/tmp/Agent/.houston/trackers/linear/connection.json")
        );
    }

    #[test]
    fn connection_meta_atomic_write_round_trip() {
        let dir = TempDir::new().unwrap();
        let workspace = dir.path();

        let meta = ConnectionMeta {
            provider: "linear".into(),
            org_id: "org-uuid".into(),
            org_name: "Acme Inc".into(),
            app_user_id: None,
            capabilities: vec!["issues".into(), "projects".into()],
            oauth_access_token_ref: Some("keychain:org-uuid:access".into()),
            oauth_refresh_token_ref: Some("keychain:org-uuid:refresh".into()),
            oauth_token_expires_at: Some(unix_to_iso(1_716_473_400)),
            webhook_secret_ref: None,
            scopes: vec!["read".into(), "write".into()],
            connected_at: now_iso(),
            last_sync_at: None,
        };

        meta.write_atomic(workspace).unwrap();
        let loaded = ConnectionMeta::load(workspace).unwrap();
        assert_eq!(meta, loaded);
    }

    #[test]
    fn load_missing_returns_not_authenticated() {
        let dir = TempDir::new().unwrap();
        let err = ConnectionMeta::load(dir.path()).unwrap_err();
        assert!(matches!(err, LinearError::NotAuthenticated));
    }
}
