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
use std::path::{Path, PathBuf};
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
/// Technical files (json, py, md) are excluded — they confuse non-technical users.
const USER_EXTENSIONS: &[&str] = &[
    "docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf", "png", "jpg", "jpeg", "svg", "gif", "txt",
    "rtf", "csv",
];

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
    let mut out = Vec::new();
    collect_files(agent_root, agent_root, &mut out);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Read an arbitrary text file from the agent by relative path.
pub fn read_project_file(agent_root: &Path, rel_path: &str) -> CoreResult<String> {
    let full = resolve_existing(agent_root, rel_path)?;
    std::fs::read_to_string(&full)
        .map_err(|e| CoreError::Internal(format!("failed to read {rel_path}: {e}")))
}

/// Rename a file or folder in the agent.
pub fn rename_file(agent_root: &Path, rel_path: &str, new_name: &str) -> CoreResult<()> {
    let full = resolve_existing(agent_root, rel_path)?;
    let parent = full
        .parent()
        .ok_or_else(|| CoreError::BadRequest("invalid file path".into()))?;
    let new_path = parent.join(new_name);
    std::fs::rename(&full, &new_path)
        .map_err(|e| CoreError::Internal(format!("failed to rename: {e}")))
}

/// Delete a file from the agent.
pub fn delete_file(agent_root: &Path, rel_path: &str) -> CoreResult<()> {
    let full = resolve_existing(agent_root, rel_path)?;
    std::fs::remove_file(&full).map_err(|e| CoreError::Internal(format!("failed to delete: {e}")))
}

/// Create a folder inside the agent. Accepts a relative path (e.g., `docs`
/// or `output/images`); creates intermediate directories. Returns the
/// trimmed relative path that was created.
pub fn create_folder(agent_root: &Path, relative: &str) -> CoreResult<String> {
    let relative = relative.trim().trim_matches('/');
    if relative.is_empty() {
        return Err(CoreError::BadRequest("folder name cannot be empty".into()));
    }
    let target = agent_root.join(relative);
    std::fs::create_dir_all(&target)
        .map_err(|e| CoreError::Internal(format!("failed to create folder {relative}: {e}")))?;
    Ok(relative.to_string())
}

/// Copy a file from an absolute source path into an agent directory.
/// Returns the file name used (deduplicated if a clash exists).
pub fn copy_file_to_dir(dir: &Path, source: &Path) -> CoreResult<String> {
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

/// Write raw bytes as a file into an agent directory. Returns the deduped name.
pub fn write_bytes_dedup(dir: &Path, name: &str, data: &[u8]) -> CoreResult<String> {
    let dest = deduplicate_name(dir, name);
    let final_name = dest.file_name().unwrap().to_string_lossy().to_string();
    std::fs::write(&dest, data)
        .map_err(|e| CoreError::Internal(format!("failed to write {name}: {e}")))?;
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
            let d = agent_root.join(folder);
            std::fs::create_dir_all(&d)
                .map_err(|e| CoreError::Internal(format!("failed to create directory: {e}")))?;
            d
        }
        None => agent_root.to_path_buf(),
    };

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
    let final_name = write_bytes_dedup(agent_root, file_name, bytes)?;
    let dest = agent_root.join(&final_name);
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
    let full = agent_root.join(rel_path);
    if !full.exists() {
        return Err(CoreError::NotFound(format!("file: {rel_path}")));
    }
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
            other => panic!(
                "expected BadRequest, got {:?}",
                other.err().map(|e| e.to_string())
            ),
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
    fn create_folder_round_trip() {
        let d = tmp();
        let made = create_folder(d.path(), "docs/inner").unwrap();
        assert_eq!(made, "docs/inner");
        assert!(d.path().join("docs/inner").is_dir());
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
    fn write_file_bytes_dedupes() {
        let d = tmp();
        let f1 = write_file_bytes(d.path(), "hello.txt", b"first").unwrap();
        let f2 = write_file_bytes(d.path(), "hello.txt", b"second").unwrap();
        assert_eq!(f1.name, "hello.txt");
        assert_eq!(f2.name, "hello (2).txt");
    }
}
