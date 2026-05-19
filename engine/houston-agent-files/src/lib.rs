//! houston-agent-files — generic file-level access to an agent's `.houston/` directory.
//!
//! Each data "type" lives in its own folder with a co-located JSON Schema:
//!   .houston/<type>/<type>.json
//!   .houston/<type>/<type>.schema.json
//!
//! Types currently in use:
//!   - activity
//!   - routines
//!   - routine_runs
//!   - config
//!   - learnings
//!
//! The crate exposes two generic functions (`read_file` / `write_file_atomic`)
//! plus helpers to seed embedded schemas and migrate from the legacy flat layout.
//!
//! Safety: all relative paths are canonicalised against the agent root before
//! read/write — any attempt to escape the root via `..` or symlink is rejected.

use std::fs;
use std::io::Write as _;
use std::path::{Component, Path, PathBuf};

use thiserror::Error;

pub mod schemas;

#[derive(Debug, Error)]
pub enum AgentFilesError {
    #[error("invalid relative path: {0}")]
    InvalidPath(String),
    #[error("path escapes agent root")]
    PathEscapesRoot,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, AgentFilesError>;

/// Sanitise a caller-supplied relative path so it cannot escape the agent root.
///
/// Rules:
///   * must be relative
///   * no `..` components
///   * no absolute prefixes, drive letters, or root components
fn safe_relative(rel: &str) -> Result<PathBuf> {
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(AgentFilesError::InvalidPath(rel.to_string()));
    }
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            Component::ParentDir => return Err(AgentFilesError::PathEscapesRoot),
            Component::Prefix(_) | Component::RootDir => {
                return Err(AgentFilesError::InvalidPath(rel.to_string()));
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err(AgentFilesError::InvalidPath(rel.to_string()));
    }
    Ok(out)
}

/// Resolve `<agent_root>/<rel>` with traversal protection.
pub fn resolve(agent_root: &Path, rel: &str) -> Result<PathBuf> {
    let safe = safe_relative(rel)?;
    Ok(agent_root.join(safe))
}

/// Read raw file contents (UTF-8 string).
pub fn read_file(agent_root: &Path, rel: &str) -> Result<String> {
    let path = resolve(agent_root, rel)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

/// Write file atomically: write to `<path>.tmp` then rename into place.
/// Creates parent directories as needed.
pub fn write_file_atomic(agent_root: &Path, rel: &str, content: &str) -> Result<()> {
    let path = resolve(agent_root, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Classify a relative path to the matching event type name.
/// Returns the first path component of `.houston/<type>/...` — e.g. "activity".
pub fn classify(rel: &str) -> Option<String> {
    let p = Path::new(rel);
    let mut it = p.components();
    // Expect first component to be ".houston"
    let first = it.next()?;
    let s = match first {
        Component::Normal(s) => s.to_str()?,
        _ => return None,
    };
    if s != ".houston" {
        return None;
    }
    let next = it.next()?;
    match next {
        Component::Normal(s) => s.to_str().map(|s| s.to_string()),
        _ => None,
    }
}

/// Seed the five embedded JSON Schemas under `.houston/<type>/<type>.schema.json`.
/// Idempotent: overwrites if present (schemas are compile-time constants, always authoritative).
pub fn seed_schemas(agent_root: &Path) -> Result<()> {
    for (name, content) in schemas::ALL {
        let rel = format!(".houston/{name}/{name}.schema.json");
        write_file_atomic(agent_root, &rel, content)?;
    }
    Ok(())
}

/// Migrate an agent from the legacy flat layout to the per-type folder layout.
///
/// Legacy:
///   .houston/activity.json
///   .houston/routines.json
///   .houston/routine_runs.json
///   .houston/config.json
///   .houston/memory/learnings.md
///
/// New:
///   .houston/activity/activity.json
///   .houston/routines/routines.json
///   .houston/routine_runs/routine_runs.json
///   .houston/config/config.json
///   .houston/learnings/learnings.json
///
/// Idempotent: if the old file is missing or the new one already exists, the step is skipped.
/// Old files are left in place to act as a rollback safety net — callers may remove them
/// after verifying the new layout works.
pub fn migrate_agent_data(agent_root: &Path) -> Result<()> {
    // JSON files → move to per-type folder (copy + leave original).
    for name in ["activity", "routines", "routine_runs", "config"] {
        let old_rel = format!(".houston/{name}.json");
        let new_rel = format!(".houston/{name}/{name}.json");
        let old_path = agent_root.join(&old_rel);
        let new_path = agent_root.join(&new_rel);
        if old_path.exists() && !new_path.exists() {
            let content = fs::read_to_string(&old_path)?;
            write_file_atomic(agent_root, &new_rel, &content)?;
            tracing::info!(agent_root = %agent_root.display(), name, "migrated legacy agent file");
        }
    }

    // learnings.md → learnings.json (parse markdown bullet list into JSON objects).
    let learnings_md = agent_root.join(".houston/memory/learnings.md");
    let learnings_new = agent_root.join(".houston/learnings/learnings.json");
    if learnings_md.exists() && !learnings_new.exists() {
        let md = fs::read_to_string(&learnings_md)?;
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<serde_json::Value> = md
            .lines()
            .filter_map(|l| {
                let t = l.trim();
                let stripped = t
                    .strip_prefix("- ")
                    .or_else(|| t.strip_prefix("* "))
                    .unwrap_or(t);
                let stripped = stripped.trim();
                if stripped.is_empty() {
                    None
                } else {
                    Some(serde_json::json!({
                        "id": uuid::Uuid::new_v4().to_string(),
                        "text": stripped,
                        "created_at": now,
                    }))
                }
            })
            .collect();
        let body = serde_json::to_string_pretty(&entries)?;
        write_file_atomic(agent_root, ".houston/learnings/learnings.json", &body)?;
        tracing::info!(agent_root = %agent_root.display(), count = entries.len(), "migrated learnings.md → learnings.json");
    }

    // Retire product-layer prompt files that earlier versions seeded under
    // `.houston/prompts/`. These were never user-editable through any UI —
    // the Houston product prompt lives in the app process now. Deleting is
    // safe: no real user edits to preserve. User's mode overrides in
    // `modes/` are untouched.
    for legacy in [
        ".houston/prompts/system.md",
        ".houston/prompts/self-improvement.md",
    ] {
        let path = agent_root.join(legacy);
        if path.exists() {
            match fs::remove_file(&path) {
                Ok(()) => tracing::info!(
                    agent_root = %agent_root.display(),
                    file = legacy,
                    "removed legacy product prompt file"
                ),
                Err(e) => tracing::warn!(
                    agent_root = %agent_root.display(),
                    file = legacy,
                    error = %e,
                    "failed to remove legacy product prompt file"
                ),
            }
        }
    }

    // Backfill the GEMINI.md → CLAUDE.md symlink for agents created
    // before Houston started seeding it. Same shape as the AGENTS.md
    // symlink in `houston-engine-core::agents::prompt::seed_agent`:
    // gemini-cli walks UP from cwd looking for `GEMINI.md` as project
    // memory, so without this the agent's role/instructions never reach
    // the model. Idempotent: only runs when CLAUDE.md exists AND
    // GEMINI.md is absent. We deliberately do NOT replace an existing
    // GEMINI.md (user may have hand-authored a gemini-specific file).
    let claude_md = agent_root.join("CLAUDE.md");
    let gemini_md = agent_root.join("GEMINI.md");
    // `symlink_metadata` so we treat broken/dangling symlinks as
    // "exists" — replacing them would silently swap user config.
    let gemini_present = fs::symlink_metadata(&gemini_md).is_ok();
    if claude_md.exists() && !gemini_present {
        #[cfg(unix)]
        {
            if let Err(e) = std::os::unix::fs::symlink("CLAUDE.md", &gemini_md) {
                tracing::warn!(
                    agent_root = %agent_root.display(),
                    error = %e,
                    "failed to backfill GEMINI.md symlink"
                );
            } else {
                tracing::info!(
                    agent_root = %agent_root.display(),
                    "backfilled GEMINI.md → CLAUDE.md symlink"
                );
            }
        }
        #[cfg(windows)]
        {
            if let Err(e) = std::os::windows::fs::symlink_file("CLAUDE.md", &gemini_md) {
                tracing::warn!(
                    agent_root = %agent_root.display(),
                    error = %e,
                    "failed to backfill GEMINI.md symlink"
                );
            } else {
                tracing::info!(
                    agent_root = %agent_root.display(),
                    "backfilled GEMINI.md → CLAUDE.md symlink"
                );
            }
        }
    }

    // Seed schemas at the end so every migrated agent has them available.
    seed_schemas(agent_root)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn rejects_parent_dir() {
        let err = safe_relative("../etc/passwd").unwrap_err();
        matches!(err, AgentFilesError::PathEscapesRoot);
    }

    #[test]
    fn rejects_absolute() {
        let err = safe_relative("/etc/passwd").unwrap_err();
        matches!(err, AgentFilesError::InvalidPath(_));
    }

    #[test]
    fn roundtrip_write_read() {
        let dir = TempDir::new().unwrap();
        write_file_atomic(dir.path(), ".houston/activity/activity.json", "[]").unwrap();
        let got = read_file(dir.path(), ".houston/activity/activity.json").unwrap();
        assert_eq!(got, "[]");
    }

    #[test]
    fn missing_file_returns_empty() {
        let dir = TempDir::new().unwrap();
        let got = read_file(dir.path(), ".houston/activity/activity.json").unwrap();
        assert_eq!(got, "");
    }

    #[test]
    fn classify_activity() {
        assert_eq!(
            classify(".houston/activity/activity.json"),
            Some("activity".to_string())
        );
        assert_eq!(classify(".houston/routines/routines.json"), Some("routines".to_string()));
        assert_eq!(classify("CLAUDE.md"), None);
    }

    #[test]
    fn seed_schemas_writes_all() {
        let dir = TempDir::new().unwrap();
        seed_schemas(dir.path()).unwrap();
        for (name, _) in schemas::ALL {
            assert!(dir.path().join(format!(".houston/{name}/{name}.schema.json")).exists());
        }
    }

    #[test]
    fn migrate_moves_legacy_files() {
        let dir = TempDir::new().unwrap();
        let legacy = dir.path().join(".houston/activity.json");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, "[{\"id\":\"a\"}]").unwrap();

        migrate_agent_data(dir.path()).unwrap();

        let new = dir.path().join(".houston/activity/activity.json");
        assert!(new.exists());
        assert_eq!(fs::read_to_string(&new).unwrap(), "[{\"id\":\"a\"}]");
    }

    #[test]
    fn migrate_removes_legacy_product_prompts() {
        let dir = TempDir::new().unwrap();
        let prompts = dir.path().join(".houston/prompts");
        fs::create_dir_all(prompts.join("modes")).unwrap();
        fs::write(prompts.join("system.md"), "stale product prompt").unwrap();
        fs::write(prompts.join("self-improvement.md"), "stale guidance").unwrap();
        fs::write(prompts.join("modes/execution.md"), "user's mode — keep").unwrap();

        migrate_agent_data(dir.path()).unwrap();

        assert!(!prompts.join("system.md").exists());
        assert!(!prompts.join("self-improvement.md").exists());
        // User's mode override must survive.
        assert!(prompts.join("modes/execution.md").exists());
        assert_eq!(
            fs::read_to_string(prompts.join("modes/execution.md")).unwrap(),
            "user's mode — keep"
        );

        // Running again must be idempotent (no-op, no error).
        migrate_agent_data(dir.path()).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn migrate_backfills_gemini_md_symlink_for_existing_agents() {
        let dir = TempDir::new().unwrap();
        // Pre-existing agent dir from before the GEMINI.md change: only
        // CLAUDE.md exists, no GEMINI.md.
        fs::write(dir.path().join("CLAUDE.md"), "agent role").unwrap();

        migrate_agent_data(dir.path()).unwrap();

        let gemini_md = dir.path().join("GEMINI.md");
        assert_eq!(
            fs::read_link(&gemini_md).unwrap(),
            Path::new("CLAUDE.md"),
            "migration must create GEMINI.md → CLAUDE.md symlink",
        );

        // Idempotent: running again leaves the symlink in place.
        migrate_agent_data(dir.path()).unwrap();
        assert_eq!(fs::read_link(&gemini_md).unwrap(), Path::new("CLAUDE.md"));
    }

    #[cfg(unix)]
    #[test]
    fn migrate_does_not_overwrite_existing_gemini_md() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("CLAUDE.md"), "claude content").unwrap();
        fs::write(dir.path().join("GEMINI.md"), "user-authored gemini content").unwrap();

        migrate_agent_data(dir.path()).unwrap();

        // User's hand-authored GEMINI.md must survive — we only
        // backfill when GEMINI.md is absent.
        assert!(!dir.path().join("GEMINI.md").is_symlink());
        assert_eq!(
            fs::read_to_string(dir.path().join("GEMINI.md")).unwrap(),
            "user-authored gemini content"
        );
    }

    #[cfg(unix)]
    #[test]
    fn migrate_skips_gemini_md_when_claude_md_missing() {
        let dir = TempDir::new().unwrap();
        // No CLAUDE.md → nothing to point at. We must NOT create a
        // dangling symlink.
        migrate_agent_data(dir.path()).unwrap();
        assert!(!dir.path().join("GEMINI.md").exists());
        assert!(fs::symlink_metadata(dir.path().join("GEMINI.md")).is_err());
    }

    #[test]
    fn migrate_learnings_md_to_json() {
        let dir = TempDir::new().unwrap();
        let md = dir.path().join(".houston/memory/learnings.md");
        fs::create_dir_all(md.parent().unwrap()).unwrap();
        fs::write(&md, "- first learning\n- second learning\n").unwrap();

        migrate_agent_data(dir.path()).unwrap();

        let json = fs::read_to_string(dir.path().join(".houston/learnings/learnings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.as_array().unwrap().len(), 2);
        assert_eq!(parsed[0]["text"].as_str().unwrap(), "first learning");
    }
}
