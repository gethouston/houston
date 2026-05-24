//! Projected on-disk shape for Linear issues + the raw/projection
//! filesystem IO that backs them.
//!
//! Lives outside the `queries::` module because the projection is the
//! domain shape Houston reasons over — separate from the cynic wire
//! types (which exist only for the network round-trip). Reconcile
//! drives the IO; routes / hooks read [`load_projection`].

use crate::error::LinearError;
use crate::queries::issues::IssueNode;
use houston_engine_protocol::TrackerIssue;
use std::path::{Path, PathBuf};

/// Alias kept for readability inside the houston-linear crate. The
/// canonical wire type lives in `houston-engine-protocol::TrackerIssue`
/// (single source of truth used by both the engine route response and
/// this on-disk persistence layer).
pub type ProjectedIssue = TrackerIssue;

/// Extension trait so callers can `ProjectedIssue::project(&node)`
/// without importing the type via a free function. The trait body
/// constructs the wire type directly.
pub trait FromIssueNode {
    fn project(node: &IssueNode) -> Self;
}

impl FromIssueNode for TrackerIssue {
    fn project(node: &IssueNode) -> Self {
        Self {
            provider: "linear".to_string(),
            provider_id: node.id.inner().to_string(),
            identifier: node.identifier.clone(),
            title: node.title.clone(),
            description: node.description.clone(),
            state: node.state.name.clone(),
            state_type: Some(node.state.type_.clone()),
            priority: Some(node.priority as i64),
            estimate: node.estimate,
            team_id: node.team.id.inner().to_string(),
            project_id: node.project.as_ref().map(|p| p.id.inner().to_string()),
            project_milestone_id: node
                .project_milestone
                .as_ref()
                .map(|m| m.id.inner().to_string()),
            cycle_id: node.cycle.as_ref().map(|c| c.id.inner().to_string()),
            parent_id: node.parent.as_ref().map(|p| p.id.inner().to_string()),
            assignee_id: node.assignee.as_ref().map(|a| a.id.inner().to_string()),
            assigned_houston_agent_id: None,
            label_ids: node.label_ids.clone(),
            url: Some(node.url.clone()),
            created_at: node.created_at.0.clone(),
            updated_at: node.updated_at.0.clone(),
            completed_at: node.completed_at.as_ref().map(|d| d.0.clone()),
        }
    }
}

// ── Path helpers ─────────────────────────────────────────────────

pub fn raw_issues_dir(workspace_path: &Path) -> PathBuf {
    workspace_path
        .join(".houston")
        .join("trackers")
        .join("linear")
        .join("raw")
        .join("issues")
}

pub fn projection_path(workspace_path: &Path) -> PathBuf {
    workspace_path
        .join(".houston")
        .join("trackers")
        .join("linear")
        .join("issues.json")
}

// ── Raw + projection IO ─────────────────────────────────────────

/// Write one cynic-fetched issue to `raw/issues/<uuid>.json`.
pub fn write_raw_issue(workspace_path: &Path, node: &IssueNode) -> Result<(), LinearError> {
    let dir = raw_issues_dir(workspace_path);
    std::fs::create_dir_all(&dir)
        .map_err(|e| LinearError::Oauth(format!("create raw/issues dir: {e}")))?;
    let path = dir.join(format!("{}.json", node.id.inner()));
    let projected = <TrackerIssue as FromIssueNode>::project(node);
    let json = serde_json::to_string_pretty(&projected).map_err(LinearError::Json)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| LinearError::Oauth(format!("write raw issue: {e}")))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| LinearError::Oauth(format!("rename raw issue: {e}")))?;
    Ok(())
}

/// Read every `raw/issues/*.json` and emit the consolidated
/// `issues.json` projection (sorted by `updated_at` desc — freshest
/// first). Idempotent; safe to call repeatedly.
pub fn reproject_issues_from_raw(workspace_path: &Path) -> Result<usize, LinearError> {
    let dir = raw_issues_dir(workspace_path);
    let mut items: Vec<ProjectedIssue> = Vec::new();
    if dir.exists() {
        for entry in std::fs::read_dir(&dir)
            .map_err(|e| LinearError::Oauth(format!("read raw/issues dir: {e}")))?
        {
            let entry = entry.map_err(|e| LinearError::Oauth(format!("iter raw/issues: {e}")))?;
            if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let bytes = std::fs::read(entry.path())
                .map_err(|e| LinearError::Oauth(format!("read raw issue: {e}")))?;
            let issue: ProjectedIssue =
                serde_json::from_slice(&bytes).map_err(LinearError::Json)?;
            items.push(issue);
        }
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let path = projection_path(workspace_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| LinearError::Oauth(format!("create projection dir: {e}")))?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&items).map_err(LinearError::Json)?;
    std::fs::write(&tmp, json)
        .map_err(|e| LinearError::Oauth(format!("write issues.json: {e}")))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| LinearError::Oauth(format!("rename issues.json: {e}")))?;
    Ok(items.len())
}

/// Read the consolidated projection. Returns an empty vec when the
/// file is missing (typical for never-connected workspaces — the
/// caller decides whether to surface that vs. NotAuthenticated).
pub fn load_projection(workspace_path: &Path) -> Result<Vec<ProjectedIssue>, LinearError> {
    let path = projection_path(workspace_path);
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(LinearError::Json),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(LinearError::Oauth(format!("read issues.json: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    pub(crate) fn sample_projected(id: &str, updated: &str) -> ProjectedIssue {
        ProjectedIssue {
            provider: "linear".into(),
            provider_id: id.into(),
            identifier: format!("ENG-{id}"),
            title: format!("issue {id}"),
            description: None,
            state: "In Progress".into(),
            state_type: Some("started".into()),
            priority: Some(2),
            estimate: None,
            team_id: "team-1".into(),
            project_id: None,
            project_milestone_id: None,
            cycle_id: None,
            parent_id: None,
            assignee_id: None,
            assigned_houston_agent_id: None,
            label_ids: vec![],
            url: None,
            created_at: updated.into(),
            updated_at: updated.into(),
            completed_at: None,
        }
    }

    #[test]
    fn projected_issue_serializes_to_schema_shape() {
        let p = sample_projected("uuid-1", "2026-05-23T00:00:00Z");
        let json = serde_json::to_value(&p).unwrap();
        assert_eq!(json["provider"], "linear");
        assert_eq!(json["provider_id"], "uuid-1");
        assert_eq!(json["state_type"], "started");
        let s = serde_json::to_string(&p).unwrap();
        assert!(s.contains("\"provider_id\""));
        assert!(s.contains("\"state_type\""));
        assert!(s.contains("\"assigned_houston_agent_id\""));
    }

    #[test]
    fn load_projection_returns_empty_when_missing() {
        let dir = TempDir::new().unwrap();
        let items = load_projection(dir.path()).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn reproject_emits_sorted_descending() {
        let dir = TempDir::new().unwrap();
        let raw_dir = raw_issues_dir(dir.path());
        std::fs::create_dir_all(&raw_dir).unwrap();

        for (id, updated) in [
            ("a", "2026-05-23T10:00:00Z"),
            ("b", "2026-05-23T12:00:00Z"),
            ("c", "2026-05-23T11:00:00Z"),
        ] {
            let issue = sample_projected(id, updated);
            let path = raw_dir.join(format!("{id}.json"));
            std::fs::write(&path, serde_json::to_string(&issue).unwrap()).unwrap();
        }

        let count = reproject_issues_from_raw(dir.path()).unwrap();
        assert_eq!(count, 3);

        let projected = load_projection(dir.path()).unwrap();
        assert_eq!(projected[0].provider_id, "b");
        assert_eq!(projected[1].provider_id, "c");
        assert_eq!(projected[2].provider_id, "a");
    }
}
