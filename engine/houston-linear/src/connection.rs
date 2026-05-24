//! Connection metadata — historically persisted to
//! `<agent>/.houston/trackers/linear/connection.json` (one connection
//! per agent). PR A introduces a parallel workspace-level layout where
//! one workspace can hold many Linear-org connections at
//! `<workspace>/.houston/trackers/linear/connections/<org_id>.json`.
//!
//! Both APIs ship in PR A. Existing per-agent callers stay working;
//! the new workspace-many APIs are additive. Migration from per-agent
//! to workspace-level is exposed via [`migrate_from_agents`] and runs
//! lazily on first call to [`ConnectionMeta::list_for_workspace`].
//!
//! ## Layout (post-PR-A, workspace-many target)
//!
//! ```text
//! <workspace>/.houston/trackers/linear/
//!   connections/
//!     <org_id_a>.json                connection meta for Linear org A
//!     <org_id_b>.json                connection meta for Linear org B
//!   <org_id_a>/
//!     issues.json                    per-org projection (mirror)
//!     sync_state.json
//!     raw/
//!       issues/<linear_uuid>.json
//!       webhook_events.jsonl
//!     agent_sessions/<id>.json
//!   <org_id_b>/...
//! <workspace>/.houston/inbox/linear/
//!   <org_id_a>/<session_id>.json     delegation inbox (C4b dispatch picks agent via C7)
//! ```
//!
//! ## Layout (pre-PR-A, per-agent — still supported)
//!
//! ```text
//! <agent>/.houston/trackers/linear/
//!   connection.json
//!   issues.json
//!   sync_state.json
//!   raw/
//!     issues/<linear_uuid>.json
//!     webhook_events.jsonl
//!   agent_sessions/<id>.json
//! ```
//!
//! PR B switches the UI + routes to read+write at workspace level
//! exclusively; PR A only adds the capability.

use crate::error::LinearError;
use crate::keychain::{self, StoredTokens};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Connection metadata persisted to JSON on disk.
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

    // ── Per-agent (legacy / pre-PR-A) API ────────────────────────
    //
    // Existing routes + commands call these. They read/write a single
    // `connection.json` under the agent's `.houston/trackers/linear/`.
    // PR B will retire these once routes migrate to the workspace-many
    // shape below; until then they coexist so the UI keeps working.

    /// Compute the on-disk path for `connection.json` under a given
    /// agent root (legacy per-agent layout).
    pub fn path_for(agent_path: &Path) -> PathBuf {
        agent_path
            .join(".houston")
            .join("trackers")
            .join("linear")
            .join("connection.json")
    }

    /// Write atomically (temp + rename) to the legacy per-agent path.
    pub fn write_atomic(&self, agent_path: &Path) -> Result<(), LinearError> {
        let path = Self::path_for(agent_path);
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

    /// Load from the legacy per-agent path. Returns
    /// [`LinearError::NotAuthenticated`] when the file is missing
    /// (typical for never-connected agents).
    pub fn load(agent_path: &Path) -> Result<Self, LinearError> {
        let path = Self::path_for(agent_path);
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

    // ── Workspace-many (post-PR-A) API ──────────────────────────
    //
    // One workspace holds many `<org_id>.json` connection files. Use
    // these when working with workspace-level dispatch (C4b + C7).

    /// Workspace-level path for a given org's connection metadata.
    pub fn path_for_workspace_org(workspace_path: &Path, org_id: &str) -> PathBuf {
        connections_dir(workspace_path).join(format!("{org_id}.json"))
    }

    /// Write atomically to the workspace-level connections dir.
    pub fn write_atomic_for_workspace(&self, workspace_path: &Path) -> Result<(), LinearError> {
        let path = Self::path_for_workspace_org(workspace_path, &self.org_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| LinearError::Io(format!("create connections dir: {e}")))?;
        }
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self).map_err(LinearError::Json)?;
        std::fs::write(&tmp, json)
            .map_err(|e| LinearError::Io(format!("write {}.json: {e}", self.org_id)))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| LinearError::Io(format!("rename {}.json: {e}", self.org_id)))?;
        Ok(())
    }

    /// Load a single org's workspace-level connection.
    pub fn load_for_workspace_org(
        workspace_path: &Path,
        org_id: &str,
    ) -> Result<Self, LinearError> {
        let path = Self::path_for_workspace_org(workspace_path, org_id);
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(LinearError::NotAuthenticated);
            }
            Err(e) => {
                return Err(LinearError::Io(format!("read {org_id}.json: {e}")));
            }
        };
        serde_json::from_slice(&bytes).map_err(LinearError::Json)
    }

    /// List every Linear connection registered to the workspace.
    /// Runs a one-shot migration from any per-agent connections found
    /// at `<workspace>/<agent>/.houston/trackers/linear/connection.json`
    /// so users with the old layout transparently get the new view.
    /// Returns an empty vec when neither layout has any connections.
    pub fn list_for_workspace(workspace_path: &Path) -> Result<Vec<Self>, LinearError> {
        migrate_from_agents(workspace_path)?;

        let dir = connections_dir(workspace_path);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        let entries = std::fs::read_dir(&dir)
            .map_err(|e| LinearError::Io(format!("read connections dir: {e}")))?;
        for entry in entries {
            let entry = entry.map_err(|e| LinearError::Io(format!("iter connections dir: {e}")))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let bytes =
                std::fs::read(&path).map_err(|e| LinearError::Io(format!("read {path:?}: {e}")))?;
            let meta: ConnectionMeta = serde_json::from_slice(&bytes).map_err(LinearError::Json)?;
            out.push(meta);
        }
        // Stable order — sort by org_id so tests + UI dedupe deterministically.
        out.sort_by(|a, b| a.org_id.cmp(&b.org_id));
        Ok(out)
    }
}

/// Workspace-level `.houston/trackers/linear/` root.
pub fn workspace_linear_root(workspace_path: &Path) -> PathBuf {
    workspace_path
        .join(".houston")
        .join("trackers")
        .join("linear")
}

/// `<workspace>/.houston/trackers/linear/connections/` dir.
pub fn connections_dir(workspace_path: &Path) -> PathBuf {
    workspace_linear_root(workspace_path).join("connections")
}

/// `<workspace>/.houston/trackers/linear/<org_id>/` per-connection data dir.
pub fn org_data_dir(workspace_path: &Path, org_id: &str) -> PathBuf {
    workspace_linear_root(workspace_path).join(org_id)
}

/// Migrate any per-agent connections under the workspace to the new
/// workspace-level layout. Idempotent — skips when the workspace-level
/// connections dir already has entries; source files are NOT deleted
/// (defer cleanup to a follow-up PR so users can roll back if the new
/// shape misbehaves).
///
/// Returns the number of connections migrated this call.
pub fn migrate_from_agents(workspace_path: &Path) -> Result<usize, LinearError> {
    let dest = connections_dir(workspace_path);
    if dest.exists() {
        let has_any = std::fs::read_dir(&dest)
            .map(|mut it| it.next().is_some())
            .unwrap_or(false);
        if has_any {
            return Ok(0);
        }
    }

    if !workspace_path.exists() {
        return Ok(0);
    }

    let agents = std::fs::read_dir(workspace_path)
        .map_err(|e| LinearError::Io(format!("read workspace dir: {e}")))?;
    let mut migrated = 0usize;
    for entry in agents {
        let entry = entry.map_err(|e| LinearError::Io(format!("iter workspace dir: {e}")))?;
        if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            continue;
        }
        let legacy = entry
            .path()
            .join(".houston")
            .join("trackers")
            .join("linear")
            .join("connection.json");
        if !legacy.exists() {
            continue;
        }
        let bytes = std::fs::read(&legacy)
            .map_err(|e| LinearError::Io(format!("read legacy {legacy:?}: {e}")))?;
        let meta: ConnectionMeta = serde_json::from_slice(&bytes).map_err(LinearError::Json)?;
        meta.write_atomic_for_workspace(workspace_path)?;
        migrated += 1;
    }
    Ok(migrated)
}

/// Seed the per-agent (legacy) mirror layout. Idempotent.
pub fn seed_layout(agent_path: &Path) -> Result<(), LinearError> {
    let root = agent_path.join(".houston").join("trackers").join("linear");

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

    let events_log = root.join("raw").join("webhook_events.jsonl");
    if !events_log.exists() {
        std::fs::write(&events_log, b"")
            .map_err(|e| LinearError::Io(format!("touch webhook_events.jsonl: {e}")))?;
    }

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

/// Seed the workspace-level mirror layout for a specific (workspace, org_id)
/// pair. Idempotent. Use this when wiring a workspace-many flow (C4b/C7);
/// pre-PR-B callers still use [`seed_layout`] above.
pub fn seed_layout_for_workspace_org(
    workspace_path: &Path,
    org_id: &str,
) -> Result<(), LinearError> {
    let root = org_data_dir(workspace_path, org_id);

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

    let events_log = root.join("raw").join("webhook_events.jsonl");
    if !events_log.exists() {
        std::fs::write(&events_log, b"")
            .map_err(|e| LinearError::Io(format!("touch webhook_events.jsonl: {e}")))?;
    }

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

    fn sample_meta(org_id: &str) -> ConnectionMeta {
        ConnectionMeta {
            provider: "linear".into(),
            org_id: org_id.into(),
            org_name: format!("Org {org_id}"),
            app_user_id: None,
            capabilities: vec!["issues".into(), "projects".into()],
            oauth_access_token_ref: Some(format!("keychain:{org_id}:access")),
            oauth_refresh_token_ref: Some(format!("keychain:{org_id}:refresh")),
            oauth_token_expires_at: Some(unix_to_iso(1_716_473_400)),
            webhook_secret_ref: None,
            scopes: vec!["read".into(), "write".into()],
            connected_at: now_iso(),
            last_sync_at: None,
        }
    }

    // ── Legacy per-agent API ─────────────────────────────────────

    #[test]
    fn legacy_path_layout_per_agent() {
        let path = ConnectionMeta::path_for(Path::new("/tmp/Agent"));
        assert_eq!(
            path,
            PathBuf::from("/tmp/Agent/.houston/trackers/linear/connection.json")
        );
    }

    #[test]
    fn legacy_round_trip_per_agent() {
        let dir = TempDir::new().unwrap();
        let meta = sample_meta("org-1");
        meta.write_atomic(dir.path()).unwrap();
        let loaded = ConnectionMeta::load(dir.path()).unwrap();
        assert_eq!(meta, loaded);
    }

    #[test]
    fn legacy_load_missing_returns_not_authenticated() {
        let dir = TempDir::new().unwrap();
        let err = ConnectionMeta::load(dir.path()).unwrap_err();
        assert!(matches!(err, LinearError::NotAuthenticated));
    }

    // ── Workspace-many API ───────────────────────────────────────

    #[test]
    fn workspace_path_namespaces_by_org_id() {
        let p = ConnectionMeta::path_for_workspace_org(Path::new("/tmp/W"), "org-abc");
        assert_eq!(
            p,
            PathBuf::from("/tmp/W/.houston/trackers/linear/connections/org-abc.json")
        );
    }

    #[test]
    fn org_data_dir_layout() {
        let d = org_data_dir(Path::new("/tmp/W"), "org-abc");
        assert_eq!(d, PathBuf::from("/tmp/W/.houston/trackers/linear/org-abc"));
    }

    #[test]
    fn workspace_round_trip_per_org() {
        let dir = TempDir::new().unwrap();
        let meta = sample_meta("org-1");
        meta.write_atomic_for_workspace(dir.path()).unwrap();
        let loaded = ConnectionMeta::load_for_workspace_org(dir.path(), "org-1").unwrap();
        assert_eq!(meta, loaded);
    }

    #[test]
    fn workspace_load_missing_org_returns_not_authenticated() {
        let dir = TempDir::new().unwrap();
        let err = ConnectionMeta::load_for_workspace_org(dir.path(), "absent").unwrap_err();
        assert!(matches!(err, LinearError::NotAuthenticated));
    }

    #[test]
    fn list_empty_workspace_is_empty() {
        let dir = TempDir::new().unwrap();
        let list = ConnectionMeta::list_for_workspace(dir.path()).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn list_returns_sorted_by_org_id() {
        let dir = TempDir::new().unwrap();
        sample_meta("zeta")
            .write_atomic_for_workspace(dir.path())
            .unwrap();
        sample_meta("alpha")
            .write_atomic_for_workspace(dir.path())
            .unwrap();
        sample_meta("middle")
            .write_atomic_for_workspace(dir.path())
            .unwrap();
        let list = ConnectionMeta::list_for_workspace(dir.path()).unwrap();
        let ids: Vec<_> = list.iter().map(|m| m.org_id.as_str()).collect();
        assert_eq!(ids, vec!["alpha", "middle", "zeta"]);
    }

    #[test]
    fn migrate_moves_per_agent_to_workspace_level() {
        // Two agents under one workspace, each with a legacy per-agent
        // connection.json. List should surface both at workspace level
        // after the migration ran.
        let dir = TempDir::new().unwrap();
        let ws = dir.path();
        for (agent, org) in [("AgentA", "org-a"), ("AgentB", "org-b")] {
            let legacy = ws
                .join(agent)
                .join(".houston")
                .join("trackers")
                .join("linear");
            std::fs::create_dir_all(&legacy).unwrap();
            let path = legacy.join("connection.json");
            std::fs::write(&path, serde_json::to_string(&sample_meta(org)).unwrap()).unwrap();
        }

        let list = ConnectionMeta::list_for_workspace(ws).unwrap();
        assert_eq!(list.len(), 2);
        let ids: Vec<_> = list.iter().map(|m| m.org_id.as_str()).collect();
        assert_eq!(ids, vec!["org-a", "org-b"]);

        // Workspace-level files now exist.
        assert!(connections_dir(ws).join("org-a.json").exists());
        assert!(connections_dir(ws).join("org-b.json").exists());

        // Legacy files left in place for rollback safety.
        assert!(ws
            .join("AgentA/.houston/trackers/linear/connection.json")
            .exists());
    }

    #[test]
    fn migration_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let ws = dir.path();
        let agent_a = ws.join("AgentA/.houston/trackers/linear");
        std::fs::create_dir_all(&agent_a).unwrap();
        std::fs::write(
            agent_a.join("connection.json"),
            serde_json::to_string(&sample_meta("org-a")).unwrap(),
        )
        .unwrap();

        let n1 = migrate_from_agents(ws).unwrap();
        assert_eq!(n1, 1);
        let n2 = migrate_from_agents(ws).unwrap();
        assert_eq!(n2, 0, "second call should detect existing + skip");
    }

    #[test]
    fn seed_layout_per_agent_creates_dirs() {
        let dir = TempDir::new().unwrap();
        seed_layout(dir.path()).unwrap();
        let root = dir.path().join(".houston/trackers/linear");
        assert!(root.join("raw/issues").is_dir());
        assert!(root.join("raw/webhook_events.jsonl").is_file());
        assert!(root.join("issues.json").is_file());
    }

    #[test]
    fn seed_layout_for_workspace_org_creates_per_org_dirs() {
        let dir = TempDir::new().unwrap();
        seed_layout_for_workspace_org(dir.path(), "org-x").unwrap();
        let root = org_data_dir(dir.path(), "org-x");
        assert!(root.join("raw/issues").is_dir());
        assert!(root.join("raw/webhook_events.jsonl").is_file());
        assert!(root.join("issues.json").is_file());
    }
}
