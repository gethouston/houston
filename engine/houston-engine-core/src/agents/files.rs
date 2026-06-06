//! Generic file I/O for an agent's directory.
//!
//! Two layers:
//!  * **Agent-data files** — `read`/`write_atomic`/`seed_schemas`/`migrate`
//!    operate on `.houston/<type>/<type>.json` and friends, with path-traversal
//!    safety enforced by `houston-agent-files`. Writes return the matching
//!    `HoustonEvent` so the caller (REST handler or Tauri command) can fan it
//!    out through whatever sink it owns.
//!  * **User-facing project files** — `list_project_files`, `import_files`,
//!    `write_file_bytes`, `create_folder`, `rename_file`, `delete_file`, and
//!    `read_project_file` power the file browser. They live next to the
//!    agent's CLAUDE.md (not under `.houston/`).
//!
//! Relocated from `app/houston-tauri/src/agent_files.rs` and the FS-ops chunk
//! of `app/houston-tauri/src/agent_commands.rs` as part of the engine-standalone
//! migration. OS-native commands (open in file manager, open URL, file pickers) stay
//! in the Tauri adapter — they have no meaning when the engine runs remotely.

use crate::error::{CoreError, CoreResult};
use houston_agent_files as files;
use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

// ---------------------------------------------------------------------------
// Agent-data files
// ---------------------------------------------------------------------------

/// Read a file under an agent's directory. Returns `""` if the file does not
/// exist (mirrors the legacy Tauri-command behaviour).
pub fn read_agent_file(agent_root: &Path, rel_path: &str) -> CoreResult<String> {
    files::read_file(agent_root, rel_path).map_err(file_err)
}

/// Write a file atomically under an agent's directory and return the
/// `HoustonEvent` that the caller should emit (or `None` for paths outside
/// the typed `.houston/` layout).
pub fn write_agent_file(
    agent_root: &Path,
    agent_path: &str,
    rel_path: &str,
    content: &str,
) -> CoreResult<Option<HoustonEvent>> {
    files::write_file_atomic(agent_root, rel_path, content).map_err(file_err)?;
    Ok(event_for_write(agent_path, rel_path))
}

/// Seed the embedded JSON Schemas into `.houston/<type>/<type>.schema.json`.
pub fn seed_agent_schemas(agent_root: &Path) -> CoreResult<()> {
    files::seed_schemas(agent_root).map_err(file_err)
}

/// Idempotent migration from the legacy flat `.houston/` layout.
pub fn migrate_agent_files(agent_root: &Path) -> CoreResult<()> {
    files::migrate_agent_data(agent_root).map_err(file_err)
}

fn event_for_write(agent_path: &str, rel_path: &str) -> Option<HoustonEvent> {
    if rel_path == "CLAUDE.md" || rel_path.starts_with(".houston/prompts/") {
        return Some(HoustonEvent::ContextChanged {
            agent_path: agent_path.to_string(),
        });
    }
    let kind = files::classify(rel_path)?;
    let agent_path = agent_path.to_string();
    Some(match kind.as_str() {
        "activity" => HoustonEvent::ActivityChanged { agent_path },
        "routines" => HoustonEvent::RoutinesChanged { agent_path },
        "routine_runs" => HoustonEvent::RoutineRunsChanged { agent_path },
        "config" => HoustonEvent::ConfigChanged { agent_path },
        "learnings" => HoustonEvent::LearningsChanged { agent_path },
        _ => return None,
    })
}

fn file_err(e: files::AgentFilesError) -> CoreError {
    use files::AgentFilesError::*;
    match e {
        InvalidPath(p) => CoreError::BadRequest(format!("invalid relative path: {p}")),
        PathEscapesRoot => CoreError::BadRequest("path escapes agent root".into()),
        Io(io) => CoreError::Io(io),
        Json(j) => CoreError::Json(j),
    }
}

// ---------------------------------------------------------------------------
// Project files (user-facing browser)
// ---------------------------------------------------------------------------

/// User-facing file extensions shown in the browser.
///
/// Markdown is included: it is the document format agents most often
/// produce (reports, plans, notes), so a non-technical user MUST see it
/// (issue #294). Genuinely technical files (`json`, `py`, `ts`, …) stay
/// excluded — they only confuse the non-technical audience.
const USER_EXTENSIONS: &[&str] = &[
    "docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf", "png", "jpg", "jpeg", "svg", "gif", "txt",
    "rtf", "csv", "md", "markdown",
];

/// Agent-role instruction files seeded at the agent root. They are
/// markdown, but they are the agent's "brain" (its job description), not
/// user documents: `CLAUDE.md` is canonical and `AGENTS.md` / `GEMINI.md`
/// are symlink/copy mirrors of it for codex / gemini-cli (see
/// `agents::prompt::seed_agent`). Now that markdown is user-facing they
/// would otherwise surface in the file browser AND in chat file-change
/// summaries (the snapshot in `sessions::file_changes` shares this
/// filter), so they are hidden by name.
const HIDDEN_ROLE_FILES: &[&str] = &["CLAUDE.md", "AGENTS.md", "GEMINI.md"];

/// True if `name` is an agent-role instruction file that must never
/// appear as a user document. Compared case-insensitively: the canonical
/// casing is fixed but filesystems (and user-typed copies) vary.
fn is_hidden_role_file(name: &str) -> bool {
    HIDDEN_ROLE_FILES
        .iter()
        .any(|role| role.eq_ignore_ascii_case(name))
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "__pycache__"
            | ".venv"
            | "venv"
            | ".env"
            | ".cache"
            | "target"
            | "dist"
            | "build"
            | "skills"
            | "scripts"
    ) || name.starts_with('.')
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectFile {
    /// Relative path from the agent root, always forward-slash separated
    /// regardless of host OS. The frontend file tree depends on this contract
    /// to split path segments and nest entries correctly.
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub is_directory: bool,
    /// Last modification time in milliseconds since the UNIX epoch. `None`
    /// when the filesystem doesn't expose mtime for the entry (rare; the
    /// frontend renders an em-dash in that case).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_modified: Option<i64>,
}

/// Build the relative-path string used in `ProjectFile.path`: strip the agent
/// root prefix and force forward slashes so the frontend tree builder works
/// the same on Windows and Unix.
fn relative_path_string(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy();
    if std::path::MAIN_SEPARATOR == '/' {
        rel.into_owned()
    } else {
        rel.replace(std::path::MAIN_SEPARATOR, "/")
    }
}

/// Read the modification time as millis-since-epoch, returning `None` when
/// the filesystem doesn't expose it (network mounts, exotic FSes).
fn modified_millis(metadata: &std::fs::Metadata) -> Option<i64> {
    let modified = metadata.modified().ok()?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(since_epoch.as_millis()).ok()
}

/// List user-facing files in an agent folder. Returns an empty vec if the
/// folder doesn't exist (matches legacy Tauri behaviour).
pub fn list_project_files(agent_root: &Path) -> CoreResult<Vec<ProjectFile>> {
    if !agent_root.is_dir() {
        return Ok(Vec::new());
    }
    let policy = crate::agent_policy::load(agent_root)?;
    let mut out = Vec::new();
    collect_files(agent_root, agent_root, &mut out);
    out.retain(|file| {
        policy
            .ensure_path_allowed(agent_root, &agent_root.join(&file.path))
            .is_ok()
    });
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Read an arbitrary text file from the agent by relative path.
pub fn read_project_file(agent_root: &Path, rel_path: &str) -> CoreResult<String> {
    let full = resolve_existing(agent_root, rel_path)?;
    crate::agent_policy::ensure_path_allowed(agent_root, &full)?;
    std::fs::read_to_string(&full)
        .map_err(|e| CoreError::Internal(format!("failed to read {rel_path}: {e}")))
}

/// Rename a file or folder in the agent.
pub fn rename_file(agent_root: &Path, rel_path: &str, new_name: &str) -> CoreResult<()> {
    let full = resolve_existing(agent_root, rel_path)?;
    crate::agent_policy::ensure_path_allowed(agent_root, &full)?;
    if Path::new(new_name).components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(CoreError::BadRequest("new file name must not be a path".into()));
    }
    let parent = full
        .parent()
        .ok_or_else(|| CoreError::BadRequest("invalid file path".into()))?;
    let new_path = parent.join(new_name);
    crate::agent_policy::ensure_path_allowed(agent_root, &new_path)?;
    std::fs::rename(&full, &new_path)
        .map_err(|e| CoreError::Internal(format!("failed to rename: {e}")))
}

/// Delete a file from the agent.
pub fn delete_file(agent_root: &Path, rel_path: &str) -> CoreResult<()> {
    let full = resolve_existing(agent_root, rel_path)?;
    crate::agent_policy::ensure_path_allowed(agent_root, &full)?;
    std::fs::remove_file(&full)
        .map_err(|e| CoreError::Internal(format!("failed to delete: {e}")))
}

/// Create a folder inside the agent. Accepts a relative path (e.g., `docs`
/// or `output/images`); creates intermediate directories. Returns the
/// trimmed relative path that was created.
pub fn create_folder(agent_root: &Path, relative: &str) -> CoreResult<String> {
    let relative = relative.trim().trim_matches('/');
    if relative.is_empty() {
        return Err(CoreError::BadRequest("folder name cannot be empty".into()));
    }
    let target = resolve_new(agent_root, relative)?;
    crate::agent_policy::ensure_path_allowed(agent_root, &target)?;
    std::fs::create_dir_all(&target)
        .map_err(|e| CoreError::Internal(format!("failed to create folder {relative}: {e}")))?;
    Ok(relative.to_string())
}

/// Copy a file from an absolute source path into an agent directory.
/// Returns the file name used (deduplicated if a clash exists).
fn copy_file_to_dir(dir: &Path, source: &Path) -> CoreResult<String> {
    if !source.is_file() {
        return Err(CoreError::BadRequest(format!(
            "source is not a file: {}",
            source.display()
        )));
    }
    let name = source
        .file_name()
        .ok_or_else(|| CoreError::BadRequest("source has no file name".into()))?
        .to_string_lossy()
        .to_string();
    let dest = deduplicate_name(dir, &name);
    let final_name = dest.file_name().unwrap().to_string_lossy().to_string();
    std::fs::copy(source, &dest)
        .map_err(|e| CoreError::Internal(format!("failed to copy {}: {e}", source.display())))?;
    Ok(final_name)
}

/// If `dir/name` already exists, append `(2)`, `(3)`, etc. before the extension.
fn deduplicate_name(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    for i in 2..=999 {
        let new_name = match &ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let candidate = dir.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(name)
}

/// Import files from absolute paths into the agent (optionally into a sub-folder).
/// Auto-deduplicates names. Returns the imported file metadata so the UI can
/// refresh without a fresh list call.
pub fn import_files(
    agent_root: &Path,
    file_paths: &[String],
    target_folder: Option<&str>,
) -> CoreResult<Vec<ProjectFile>> {
    let dest_dir = match target_folder {
        Some(folder) => {
            let d = resolve_new(agent_root, folder)?;
            crate::agent_policy::ensure_path_allowed(agent_root, &d)?;
            std::fs::create_dir_all(&d).map_err(|e| {
                CoreError::Internal(format!("failed to create directory: {e}"))
            })?;
            d
        }
        None => agent_root.to_path_buf(),
    };
    crate::agent_policy::ensure_path_allowed(agent_root, &dest_dir)?;

    let mut imported = Vec::new();
    for src_str in file_paths {
        let src = PathBuf::from(src_str);
        match copy_file_to_dir(&dest_dir, &src) {
            Ok(final_name) => {
                let dest = dest_dir.join(&final_name);
                let ext = dest
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                let metadata = dest.metadata().ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let date_modified = metadata.as_ref().and_then(modified_millis);
                let relative = relative_path_string(agent_root, &dest);
                imported.push(ProjectFile {
                    path: relative,
                    name: final_name,
                    extension: ext,
                    size,
                    is_directory: false,
                    date_modified,
                });
            }
            Err(e) => tracing::error!("[agents] import failed for {src_str}: {e}"),
        }
    }
    Ok(imported)
}

/// Write raw bytes as a file into an agent directory (no subfolder targeting,
/// matches the legacy Tauri command). Used when files come from a web file
/// picker that doesn't expose filesystem paths.
pub fn write_file_bytes(
    agent_root: &Path,
    file_name: &str,
    bytes: &[u8],
) -> CoreResult<ProjectFile> {
    if Path::new(file_name).components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(CoreError::BadRequest("file name must not be a path".into()));
    }
    let dest = deduplicate_name(agent_root, file_name);
    crate::agent_policy::ensure_path_allowed(agent_root, &dest)?;
    let final_name = dest.file_name().unwrap().to_string_lossy().to_string();
    std::fs::write(&dest, bytes)
        .map_err(|e| CoreError::Internal(format!("failed to write {file_name}: {e}")))?;
    let ext = dest
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let metadata = dest.metadata().ok();
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    let date_modified = metadata.as_ref().and_then(modified_millis);
    Ok(ProjectFile {
        path: final_name.clone(),
        name: final_name,
        extension: ext,
        size,
        is_directory: false,
        date_modified,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn resolve_existing(agent_root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    let full = resolve_inside(agent_root, rel_path)?;
    if !full.exists() {
        return Err(CoreError::NotFound(format!("file: {rel_path}")));
    }
    Ok(full)
}

fn resolve_new(agent_root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    resolve_inside(agent_root, rel_path)
}

fn resolve_inside(agent_root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    let rel = Path::new(rel_path);
    if rel.is_absolute() {
        return Err(CoreError::BadRequest("path must be relative to agent".into()));
    }
    if rel.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(CoreError::BadRequest("path escapes agent root".into()));
    }
    let full = agent_root.join(rel);
    crate::agent_policy::ensure_path_allowed(agent_root, &full)?;
    Ok(full)
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<ProjectFile>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            let relative = relative_path_string(root, &path);
            let date_modified = entry.metadata().ok().as_ref().and_then(modified_millis);
            out.push(ProjectFile {
                path: relative,
                name,
                extension: String::new(),
                size: 0,
                is_directory: true,
                date_modified,
            });
            collect_files(root, &path, out);
            continue;
        }
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !USER_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        // Markdown passes the extension gate, so filter the seeded agent
        // role files (CLAUDE.md / AGENTS.md / GEMINI.md) here — they are
        // instructions, not user documents (issue #294).
        if is_hidden_role_file(&name) {
            continue;
        }
        let relative = relative_path_string(root, &path);
        let metadata = entry.metadata().ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let date_modified = metadata.as_ref().and_then(modified_millis);
        out.push(ProjectFile {
            path: relative,
            name,
            extension: ext,
            size,
            is_directory: false,
            date_modified,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn read_missing_returns_empty() {
        let d = tmp();
        let s = read_agent_file(d.path(), ".houston/activity/activity.json").unwrap();
        assert_eq!(s, "");
    }

    #[test]
    fn write_and_read_round_trip() {
        let d = tmp();
        let ev = write_agent_file(
            d.path(),
            "/the/agent",
            ".houston/activity/activity.json",
            "[]",
        )
        .unwrap();
        assert!(matches!(ev, Some(HoustonEvent::ActivityChanged { .. })));
        let s = read_agent_file(d.path(), ".houston/activity/activity.json").unwrap();
        assert_eq!(s, "[]");
    }

    #[test]
    fn write_claude_md_emits_context_changed() {
        let d = tmp();
        let ev = write_agent_file(d.path(), "/a", "CLAUDE.md", "# hi").unwrap();
        assert!(matches!(ev, Some(HoustonEvent::ContextChanged { .. })));
    }

    #[test]
    fn write_unknown_path_emits_nothing() {
        let d = tmp();
        let ev = write_agent_file(d.path(), "/a", "notes/foo.txt", "x").unwrap();
        assert!(ev.is_none());
    }

    #[test]
    fn path_traversal_blocked() {
        let d = tmp();
        let res = write_agent_file(d.path(), "/a", "../escape.txt", "x");
        match res {
            Err(CoreError::BadRequest(_)) => {}
            other => panic!("expected BadRequest, got {:?}", other.err().map(|e| e.to_string())),
        }
    }

    #[test]
    fn list_project_files_skips_dotdirs_and_unknown_ext() {
        let d = tmp();
        std::fs::write(d.path().join("notes.txt"), "x").unwrap();
        std::fs::write(d.path().join("script.py"), "x").unwrap();
        std::fs::create_dir_all(d.path().join(".houston/activity")).unwrap();
        std::fs::write(d.path().join(".houston/activity/activity.json"), "[]").unwrap();

        let files = list_project_files(d.path()).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"notes.txt"));
        assert!(!names.contains(&"script.py"));
        assert!(!names.iter().any(|n| n.starts_with('.')));
    }

    #[test]
    fn markdown_files_are_visible() {
        // Issue #294: agents emit markdown deliverables (reports, plans);
        // a non-technical user must see them in the browser. Genuinely
        // technical files (json, py) stay hidden.
        let d = tmp();
        std::fs::write(d.path().join("report.md"), "# Report").unwrap();
        std::fs::write(d.path().join("notes.markdown"), "notes").unwrap();
        std::fs::write(d.path().join("data.json"), "{}").unwrap();
        std::fs::write(d.path().join("script.py"), "x").unwrap();

        let files = list_project_files(d.path()).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"report.md"));
        assert!(names.contains(&"notes.markdown"));
        assert!(!names.contains(&"data.json"));
        assert!(!names.contains(&"script.py"));
    }

    #[test]
    fn agent_role_files_stay_hidden_despite_markdown() {
        // CLAUDE.md and its AGENTS.md / GEMINI.md mirrors are the agent's
        // instructions, not user documents — they must never appear even
        // though markdown is now visible (issue #294). A real markdown
        // deliverable alongside them still shows.
        let d = tmp();
        std::fs::write(d.path().join("CLAUDE.md"), "role").unwrap();
        std::fs::write(d.path().join("AGENTS.md"), "role").unwrap();
        std::fs::write(d.path().join("GEMINI.md"), "role").unwrap();
        std::fs::write(d.path().join("deliverable.md"), "# Real doc").unwrap();

        let files = list_project_files(d.path()).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"deliverable.md"));
        assert!(!names.contains(&"CLAUDE.md"));
        assert!(!names.contains(&"AGENTS.md"));
        assert!(!names.contains(&"GEMINI.md"));
    }

    #[test]
    fn list_project_files_populates_date_modified() {
        let d = tmp();
        std::fs::create_dir_all(d.path().join("docs")).unwrap();
        std::fs::write(d.path().join("docs/note.txt"), "x").unwrap();

        let files = list_project_files(d.path()).unwrap();
        let note = files
            .iter()
            .find(|f| f.path == "docs/note.txt")
            .expect("note.txt missing");
        let dir = files
            .iter()
            .find(|f| f.path == "docs")
            .expect("docs missing");
        assert!(note.date_modified.is_some(), "file mtime should populate");
        assert!(dir.date_modified.is_some(), "dir mtime should populate");
        assert!(note.date_modified.unwrap() > 0);
    }

    #[test]
    fn list_project_files_uses_forward_slashes_on_all_platforms() {
        let d = tmp();
        std::fs::create_dir_all(d.path().join("docs/inner")).unwrap();
        std::fs::write(d.path().join("docs/inner/note.txt"), "x").unwrap();
        std::fs::create_dir_all(d.path().join("empty")).unwrap();

        let files = list_project_files(d.path()).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"docs"));
        assert!(paths.contains(&"docs/inner"));
        assert!(paths.contains(&"docs/inner/note.txt"));
        assert!(paths.contains(&"empty"));
        assert!(!paths.iter().any(|p| p.contains('\\')));
    }

    #[test]
    fn list_project_files_filters_policy_denied_paths() {
        let d = tmp();
        std::fs::create_dir_all(d.path().join(".houston")).unwrap();
        std::fs::create_dir_all(d.path().join("reports")).unwrap();
        std::fs::write(d.path().join("reports/visible.txt"), "ok").unwrap();
        std::fs::write(d.path().join("secret.txt"), "no").unwrap();
        std::fs::write(
            crate::agent_policy::policy_path(d.path()),
            r#"{"version":1,"allowed_roots":["reports"]}"#,
        )
        .unwrap();

        let files = list_project_files(d.path()).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"reports"));
        assert!(paths.contains(&"reports/visible.txt"));
        assert!(!paths.contains(&"secret.txt"));
    }

    #[test]
    fn create_folder_round_trip() {
        let d = tmp();
        let made = create_folder(d.path(), "docs/inner").unwrap();
        assert_eq!(made, "docs/inner");
        assert!(d.path().join("docs/inner").is_dir());
    }

    #[test]
    fn project_file_read_blocks_parent_traversal() {
        let d = tmp();
        let agent = d.path().join("finance");
        let sales = d.path().join("sales");
        std::fs::create_dir_all(&agent).unwrap();
        std::fs::create_dir_all(&sales).unwrap();
        std::fs::write(sales.join("secret.txt"), "sales").unwrap();

        let err = read_project_file(&agent, "../sales/secret.txt").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn project_file_create_folder_blocks_parent_traversal() {
        let d = tmp();
        let agent = d.path().join("finance");
        std::fs::create_dir_all(&agent).unwrap();

        let err = create_folder(&agent, "../sales").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
        assert!(!d.path().join("sales").exists());
    }

    #[test]
    fn rename_and_delete() {
        let d = tmp();
        std::fs::write(d.path().join("a.txt"), "x").unwrap();
        rename_file(d.path(), "a.txt", "b.txt").unwrap();
        assert!(d.path().join("b.txt").exists());
        delete_file(d.path(), "b.txt").unwrap();
        assert!(!d.path().join("b.txt").exists());
    }

    #[test]
    fn rename_rejects_path_as_new_name() {
        let d = tmp();
        std::fs::write(d.path().join("a.txt"), "x").unwrap();
        let err = rename_file(d.path(), "a.txt", "../b.txt").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
        assert!(d.path().join("a.txt").exists());
    }

    #[test]
    fn write_file_bytes_dedupes() {
        let d = tmp();
        let f1 = write_file_bytes(d.path(), "hello.txt", b"first").unwrap();
        let f2 = write_file_bytes(d.path(), "hello.txt", b"second").unwrap();
        assert_eq!(f1.name, "hello.txt");
        assert_eq!(f2.name, "hello (2).txt");
    }

    #[test]
    fn write_file_bytes_rejects_path_name() {
        let d = tmp();
        let err = write_file_bytes(d.path(), "../hello.txt", b"x").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
        assert!(!d.path().join("hello.txt").exists());
    }
}
