//! Per-workspace polling cursor + reconcile health.
//!
//! Persisted at `.houston/trackers/linear/sync_state.json`. Held by
//! [`crate::reconcile`] across runs so each reconcile starts from
//! where the last one left off (`updatedAt > cursor` filter).

use crate::error::LinearError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Reconcile checkpoint state. One file per workspace per provider.
///
/// Cursors are RFC 3339 timestamps (Linear's `updatedAt`). The
/// reconciler advances each cursor to the latest `updatedAt` seen in
/// the page just processed; a subsequent run resumes from there.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SyncState {
    /// Latest `updatedAt` observed for any issue (RFC 3339).
    pub issues_cursor: Option<String>,
    /// Latest `updatedAt` observed for any project (RFC 3339).
    pub projects_cursor: Option<String>,
    /// Latest `updatedAt` observed for any initiative (RFC 3339).
    pub initiatives_cursor: Option<String>,
    /// Latest `updatedAt` observed for any cycle (RFC 3339).
    pub cycles_cursor: Option<String>,
    /// Wall-clock time the last reconcile completed (RFC 3339).
    pub last_reconcile_at: Option<String>,
    /// Last error surface, set on reconcile failure + cleared on
    /// successful run.
    pub last_error: Option<String>,
    /// True while a reconcile is in flight; prevents concurrent
    /// reconciles for the same workspace.
    #[serde(default)]
    pub in_flight: bool,
}

impl SyncState {
    /// Compute the on-disk path for `sync_state.json`.
    pub fn path_for(workspace_path: &Path) -> PathBuf {
        workspace_path
            .join(".houston")
            .join("trackers")
            .join("linear")
            .join("sync_state.json")
    }

    /// Load from disk. Returns [`SyncState::default()`] when the file
    /// is missing — never authenticates failure (a brand-new
    /// connection has no sync state yet).
    pub fn load(workspace_path: &Path) -> Result<Self, LinearError> {
        let path = Self::path_for(workspace_path);
        match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(LinearError::Json),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(LinearError::Io(format!("read sync_state.json: {e}"))),
        }
    }

    /// Write atomically (temp + rename). Caller ensures the parent
    /// directory exists (typically true after `seed_layout`).
    pub fn save_atomic(&self, workspace_path: &Path) -> Result<(), LinearError> {
        let path = Self::path_for(workspace_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| LinearError::Io(format!("create sync_state dir: {e}")))?;
        }
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self).map_err(LinearError::Json)?;
        std::fs::write(&tmp, json)
            .map_err(|e| LinearError::Io(format!("write sync_state.json: {e}")))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| LinearError::Io(format!("rename sync_state.json: {e}")))?;
        Ok(())
    }

    // ── Workspace-many (PR D) variants ──────────────────────────
    //
    // Per-(workspace, org_id) sync state under
    // `<workspace>/.houston/trackers/linear/<org_id>/sync_state.json`.
    // Composes with the workspace-level connection layout from PR A.
    // Pre-PR-D callers continue to use the per-agent helpers above;
    // PR E retires them after the new shape soaks.

    /// Workspace-level path for a given org's sync state.
    pub fn path_for_workspace_org(workspace_path: &Path, org_id: &str) -> PathBuf {
        crate::connection::org_data_dir(workspace_path, org_id).join("sync_state.json")
    }

    /// Load from the per-(workspace, org) path. Returns
    /// [`SyncState::default()`] when missing.
    pub fn load_for_workspace_org(
        workspace_path: &Path,
        org_id: &str,
    ) -> Result<Self, LinearError> {
        let path = Self::path_for_workspace_org(workspace_path, org_id);
        match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(LinearError::Json),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(LinearError::Io(format!("read sync_state.json: {e}"))),
        }
    }

    /// Write atomically to the per-(workspace, org) path.
    pub fn save_atomic_for_workspace_org(
        &self,
        workspace_path: &Path,
        org_id: &str,
    ) -> Result<(), LinearError> {
        let path = Self::path_for_workspace_org(workspace_path, org_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| LinearError::Io(format!("create sync_state dir: {e}")))?;
        }
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self).map_err(LinearError::Json)?;
        std::fs::write(&tmp, json)
            .map_err(|e| LinearError::Io(format!("write sync_state.json: {e}")))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| LinearError::Io(format!("rename sync_state.json: {e}")))?;
        Ok(())
    }

    /// Convenience: take an RFC 3339 string and update `issues_cursor`
    /// if the new value is strictly later than the current. Caller
    /// drives this from the latest `updatedAt` in a reconcile page.
    pub fn advance_issues_cursor(&mut self, candidate: &str) {
        if self
            .issues_cursor
            .as_deref()
            .map(|cur| candidate > cur)
            .unwrap_or(true)
        {
            self.issues_cursor = Some(candidate.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn default_is_empty() {
        let s = SyncState::default();
        assert!(s.issues_cursor.is_none());
        assert!(s.last_reconcile_at.is_none());
        assert!(!s.in_flight);
    }

    #[test]
    fn missing_file_loads_as_default() {
        let dir = TempDir::new().unwrap();
        let loaded = SyncState::load(dir.path()).unwrap();
        assert_eq!(loaded, SyncState::default());
    }

    #[test]
    fn round_trip_save_load() {
        let dir = TempDir::new().unwrap();
        let s = SyncState {
            issues_cursor: Some("2026-05-23T20:00:00Z".into()),
            projects_cursor: None,
            initiatives_cursor: None,
            cycles_cursor: None,
            last_reconcile_at: Some("2026-05-23T20:01:00Z".into()),
            last_error: None,
            in_flight: false,
        };
        s.save_atomic(dir.path()).unwrap();
        let loaded = SyncState::load(dir.path()).unwrap();
        assert_eq!(s, loaded);
    }

    #[test]
    fn advance_cursor_takes_strictly_later() {
        let mut s = SyncState::default();
        s.advance_issues_cursor("2026-05-23T20:00:00Z");
        assert_eq!(s.issues_cursor.as_deref(), Some("2026-05-23T20:00:00Z"));
        s.advance_issues_cursor("2026-05-23T19:00:00Z"); // earlier — ignored
        assert_eq!(s.issues_cursor.as_deref(), Some("2026-05-23T20:00:00Z"));
        s.advance_issues_cursor("2026-05-23T21:00:00Z"); // later — taken
        assert_eq!(s.issues_cursor.as_deref(), Some("2026-05-23T21:00:00Z"));
    }
}
