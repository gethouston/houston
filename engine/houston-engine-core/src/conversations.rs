//! Conversation listing — derived view over `.houston/activity/activity.json`.
//!
//! A conversation is addressed by its activity's stored `session_key`. Normal
//! missions use the `activity-{id}` convention; routine chats use a stable
//! `routine-{routine_id}` key shared by every run (#381), so all of a
//! routine's runs collapse into one conversation. We surface the row's stored
//! key verbatim — falling back to `activity-{id}` only for legacy rows written
//! before the field existed — so Mission Control loads the same history the
//! per-agent board does. This module reads the JSON file directly via
//! `houston_agent_files` so it does not depend on the full agent_store
//! layer. Phase 2 slice 4 will move the activity writer here too and
//! collapse the duplication with `app/houston-tauri/src/agent_store/`.

use crate::error::{CoreError, CoreResult};
use houston_agent_files as files;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Minimal view of an activity entry — only the fields conversations need.
#[derive(Debug, Clone, Deserialize)]
struct ActivityRow {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    status: String,
    /// The conversation address this activity persisted. Routine chats store
    /// `routine-{routine_id}`; normal missions store `activity-{id}`. Legacy
    /// rows written before this field existed leave it `None`.
    #[serde(default)]
    session_key: Option<String>,
    #[serde(default)]
    agent: Option<String>,
    #[serde(default)]
    routine_id: Option<String>,
    #[serde(default)]
    worktree_path: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationEntry {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// Always `"activity"` today. Field kept for forward compatibility.
    #[serde(rename = "type")]
    pub entry_type: String,
    /// Key used to address this conversation. `activity-{id}` for normal
    /// missions, `routine-{routine_id}` for routine chats (shared by every run
    /// of the routine). The frontend must NOT re-derive this from `id` — a
    /// routine's conversation lives under its routine key, not `activity-{id}`.
    pub session_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Absolute path to the agent folder this conversation belongs to.
    pub agent_path: String,
    /// Human-readable agent name.
    pub agent_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routine_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

fn read_activities(root: &Path) -> CoreResult<Vec<ActivityRow>> {
    let contents = files::read_file(root, ".houston/activity/activity.json")
        .map_err(|e| CoreError::Internal(format!("failed to read activity.json: {e}")))?;
    if contents.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str::<Vec<ActivityRow>>(&contents).map_err(Into::into)
}

/// List every conversation in a single agent, most-recently-updated first.
pub fn list(root: &Path) -> CoreResult<Vec<ConversationEntry>> {
    let agent_path_str = root.to_string_lossy().into_owned();
    let agent_name_str = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut rows = read_activities(root)?;
    rows.sort_by(|a, b| {
        let a_t = a.updated_at.as_deref().unwrap_or("");
        let b_t = b.updated_at.as_deref().unwrap_or("");
        b_t.cmp(a_t)
    });

    Ok(rows
        .into_iter()
        .map(|row| ConversationEntry {
            // Use the activity's stored key verbatim so routine chats resolve
            // to `routine-{rid}` (where every run's feed aggregates), not a
            // per-activity key that would load an empty history. Legacy rows
            // with no stored key fall back to the `activity-{id}` convention.
            session_key: row
                .session_key
                .filter(|key| !key.is_empty())
                .unwrap_or_else(|| format!("activity-{}", row.id)),
            id: row.id,
            title: row.title,
            description: Some(row.description).filter(|d| !d.is_empty()),
            status: Some(row.status),
            entry_type: "activity".to_string(),
            updated_at: row.updated_at,
            agent_path: agent_path_str.clone(),
            agent_name: agent_name_str.clone(),
            agent: row.agent,
            routine_id: row.routine_id,
            worktree_path: row.worktree_path,
            provider: row.provider.filter(|p| !p.is_empty()),
            model: row.model.filter(|m| !m.is_empty()),
        })
        .collect())
}

/// Aggregate conversations across many agents, most-recent first.
///
/// Errors on individual agents are logged and skipped — one bad agent
/// does not poison the aggregate view.
pub fn list_all(roots: &[&Path]) -> CoreResult<Vec<ConversationEntry>> {
    let mut all = Vec::new();
    for root in roots {
        match list(root) {
            Ok(entries) => all.extend(entries),
            Err(e) => tracing::warn!("[conversations] skipping {}: {e}", root.display()),
        }
    }
    all.sort_by(|a, b| {
        let a_t = a.updated_at.as_deref().unwrap_or("");
        let b_t = b.updated_at.as_deref().unwrap_or("");
        b_t.cmp(a_t)
    });
    Ok(all)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn seed(dir: &Path, activities: serde_json::Value) {
        let rel = dir.join(".houston").join("activity");
        fs::create_dir_all(&rel).unwrap();
        fs::write(
            rel.join("activity.json"),
            serde_json::to_string_pretty(&activities).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn empty_when_missing() {
        let d = TempDir::new().unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn list_sorted_desc() {
        let d = TempDir::new().unwrap();
        seed(
            d.path(),
            serde_json::json!([
                { "id": "a", "title": "Old",   "description": "",  "status": "done",    "updated_at": "2025-01-01T00:00:00Z" },
                { "id": "b", "title": "Newer", "description": "d", "status": "running", "updated_at": "2026-02-02T00:00:00Z" },
            ]),
        );
        let entries = list(d.path()).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "b");
        assert_eq!(entries[0].session_key, "activity-b");
        assert_eq!(entries[0].entry_type, "activity");
        assert_eq!(entries[0].description.as_deref(), Some("d"));
        assert_eq!(entries[1].description, None); // empty description → None
    }

    #[test]
    fn routine_activity_keeps_its_stored_session_key() {
        // A routine chat persists `routine-{rid}` (shared by every run). The
        // conversation list MUST surface that key, not rewrite it to
        // `activity-{id}` — otherwise Mission Control addresses the wrong
        // conversation and the routine's history loads empty (#381).
        let d = TempDir::new().unwrap();
        seed(
            d.path(),
            serde_json::json!([
                { "id": "act-uuid", "title": "Morning digest", "description": "",
                  "status": "needs_you", "session_key": "routine-abc",
                  "routine_id": "abc", "updated_at": "2026-02-02T00:00:00Z" },
            ]),
        );
        let entries = list(d.path()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "act-uuid");
        assert_eq!(entries[0].routine_id.as_deref(), Some("abc"));
        assert_eq!(
            entries[0].session_key, "routine-abc",
            "routine chats keep their stable per-routine key"
        );
    }

    #[test]
    fn preserves_activity_provider_model() {
        let d = TempDir::new().unwrap();
        seed(
            d.path(),
            serde_json::json!([
                { "id": "act", "title": "Work", "description": "", "status": "running",
                  "session_key": "activity-act", "provider": "openrouter",
                  "model": "qwen/qwen3-coder-next",
                  "updated_at": "2026-02-02T00:00:00Z" },
            ]),
        );
        let entries = list(d.path()).unwrap();
        assert_eq!(entries[0].provider.as_deref(), Some("openrouter"));
        assert_eq!(entries[0].model.as_deref(), Some("qwen/qwen3-coder-next"));
    }

    #[test]
    fn preserves_activity_card_metadata() {
        let d = TempDir::new().unwrap();
        seed(
            d.path(),
            serde_json::json!([
                { "id": "act", "title": "Work", "description": "", "status": "running",
                  "session_key": "activity-act", "agent": "research",
                  "worktree_path": "/tmp/worktree",
                  "updated_at": "2026-02-02T00:00:00Z" },
            ]),
        );
        let entries = list(d.path()).unwrap();
        assert_eq!(entries[0].agent.as_deref(), Some("research"));
        assert_eq!(entries[0].worktree_path.as_deref(), Some("/tmp/worktree"));
    }

    #[test]
    fn missing_or_empty_session_key_falls_back_to_activity_convention() {
        // Legacy rows (written before session_key was persisted) and rows that
        // stored an empty string both fall back to `activity-{id}` so normal
        // missions still resolve.
        let d = TempDir::new().unwrap();
        seed(
            d.path(),
            serde_json::json!([
                { "id": "legacy", "title": "Old", "description": "", "status": "done",
                  "updated_at": "2026-01-02T00:00:00Z" },
                { "id": "blank", "title": "Blank", "description": "", "status": "done",
                  "session_key": "", "updated_at": "2026-01-01T00:00:00Z" },
            ]),
        );
        let entries = list(d.path()).unwrap();
        let by_id = |id: &str| {
            entries
                .iter()
                .find(|e| e.id == id)
                .unwrap_or_else(|| panic!("entry {id}"))
                .session_key
                .clone()
        };
        assert_eq!(by_id("legacy"), "activity-legacy");
        assert_eq!(by_id("blank"), "activity-blank");
    }

    #[test]
    fn list_all_aggregates() {
        let d1 = TempDir::new().unwrap();
        let d2 = TempDir::new().unwrap();
        seed(
            d1.path(),
            serde_json::json!([
                { "id": "x", "title": "X", "description": "", "status": "done",
                  "updated_at": "2026-01-01T00:00:00Z" }
            ]),
        );
        seed(
            d2.path(),
            serde_json::json!([
                { "id": "y", "title": "Y", "description": "", "status": "done",
                  "updated_at": "2026-03-01T00:00:00Z" }
            ]),
        );
        let roots: Vec<&Path> = vec![d1.path(), d2.path()];
        let all = list_all(&roots).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "y");
    }
}
