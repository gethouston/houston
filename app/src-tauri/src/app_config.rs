//! Houston app-level configuration persisted at `~/.houston/app-config.json`.
//!
//! Read by the Tauri boot BEFORE the engine subprocess is spawned, so the
//! user's chosen workspace-root location (`docsRoot`) can be injected as
//! `HOUSTON_DOCS`. Absent or empty `docsRoot` keeps the historical default
//! (`<home>/workspaces`, i.e. `~/.houston/workspaces/`), so existing installs
//! behave exactly as before until the user opts into a visible, git-backed
//! root via Settings.
//!
//! A workspace-location *change* is staged here (`migrateFrom`) and applied at
//! the next boot, BEFORE the engine starts — so the move never races a live
//! engine that is still reading/writing the old root.

use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "app-config.json";
const MANIFEST: &str = "workspaces.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Absolute path the user chose as their visible, git-backed Houston root.
    /// `None`/empty → default `<home>/workspaces`. Stored already-resolved
    /// (absolute) so the app (migrate) and engine (resolve) never disagree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docs_root: Option<String>,
    /// Set by `set_docs_root` when the user changes the location. The next boot
    /// moves the tree FROM this path INTO `docs_root` before the engine starts,
    /// then clears it. Absolute path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub migrate_from: Option<String>,
}

fn config_path(houston: &Path) -> PathBuf {
    houston.join(FILE_NAME)
}

/// The one tilde-expander used on the docs-root path. Delegates to the shared
/// `houston_tauri::paths::expand_tilde` so the app (migrate) and the engine
/// (resolve) never diverge on what a stored `docsRoot` means.
pub fn expand_path(path: &str) -> PathBuf {
    houston_tauri::paths::expand_tilde(&PathBuf::from(path))
}

/// Load app config. A missing file is the normal first-run case → default.
/// A corrupt file is logged and treated as default rather than crashing boot:
/// there is no UI thread to toast on this early, and a broken config must never
/// wedge startup.
pub fn load(houston: &Path) -> AppConfig {
    let path = config_path(houston);
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return AppConfig::default(),
        Err(e) => {
            tracing::warn!("[app-config] read {} failed: {e}", path.display());
            return AppConfig::default();
        }
    };
    match serde_json::from_str(&contents) {
        Ok(cfg) => cfg,
        Err(e) => {
            tracing::warn!(
                "[app-config] parse {} failed: {e}; using defaults",
                path.display()
            );
            AppConfig::default()
        }
    }
}

/// Persist app config atomically (temp + rename), matching the Houston
/// file-write convention.
pub fn save(houston: &Path, cfg: &AppConfig) -> io::Result<()> {
    std::fs::create_dir_all(houston)?;
    let path = config_path(houston);
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, json.as_bytes())?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Resolve the workspace-root (`docs`) directory the engine should use.
/// `docsRoot` from config when set + non-empty (tilde-expanded), else the
/// historical default `<home>/workspaces`.
pub fn resolve_docs_dir(houston: &Path, cfg: &AppConfig) -> PathBuf {
    match cfg
        .docs_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(root) => expand_path(root),
        None => houston.join("workspaces"),
    }
}

/// True when two paths resolve to the same location (canonicalizing when both
/// exist; lexical fallback otherwise).
pub fn paths_equal(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// True when either path is an ancestor of (or equal to) the other —
/// moving a tree into a location nested within itself would tear it.
pub fn paths_overlap(a: &Path, b: &Path) -> bool {
    let ca = std::fs::canonicalize(a).unwrap_or_else(|_| a.to_path_buf());
    let cb = std::fs::canonicalize(b).unwrap_or_else(|_| b.to_path_buf());
    ca.starts_with(&cb) || cb.starts_with(&ca)
}

/// Move an existing workspace tree from `old_root` to `new_root`.
///
/// EXDEV-safe, no-loss, and resumable:
/// - per-entry `rename`, falling back to recursive copy across filesystems
///   (external drive, network mount, iCloud) — `rename` fails `EXDEV` there;
/// - a source entry is removed only AFTER it is fully written to the
///   destination, so a crash can tear the tree but never lose data;
/// - the index `workspaces.json` is moved LAST, so an interrupted run leaves
///   the source still "migratable" and a retry resumes where it left off.
///
/// Idempotent + non-clobbering: no-op when `old_root` has no manifest or when
/// `new_root` already has one. Returns `Ok(true)` when anything moved.
pub fn migrate_docs_root(old_root: &Path, new_root: &Path) -> io::Result<bool> {
    if paths_equal(old_root, new_root) {
        return Ok(false);
    }
    if !old_root.join(MANIFEST).is_file() {
        return Ok(false); // nothing to migrate
    }
    if new_root.join(MANIFEST).is_file() {
        return Ok(false); // target already populated — never clobber
    }
    std::fs::create_dir_all(new_root)?;

    // Move the manifest LAST so the "source still has a manifest" guard above
    // stays true across a partial run, making retries resume cleanly.
    let mut entries: Vec<PathBuf> = std::fs::read_dir(old_root)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    entries.sort_by_key(|p| p.file_name() == Some(OsStr::new(MANIFEST)));

    let mut moved = false;
    for src in entries {
        let name = match src.file_name() {
            Some(n) => n.to_owned(),
            None => continue,
        };
        let dst = new_root.join(&name);
        if dst.exists() {
            tracing::warn!(
                "[migrate] left {:?} in place: already exists at destination",
                name
            );
            continue;
        }
        move_entry(&src, &dst)?;
        moved = true;
    }
    Ok(moved)
}

/// Move one entry, falling back to copy+remove across filesystems. The source
/// is removed only after the destination is fully written, so a failure leaves
/// the source intact (any partial destination copy is cleaned up).
fn move_entry(src: &Path, dst: &Path) -> io::Result<()> {
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            if let Err(copy_err) = copy_recursive(src, dst) {
                // Best-effort cleanup of the partial copy; source stays intact.
                let _ = std::fs::remove_dir_all(dst);
                let _ = std::fs::remove_file(dst);
                return Err(copy_err);
            }
            if src.is_dir() {
                std::fs::remove_dir_all(src)
            } else {
                std::fs::remove_file(src)
            }
        }
        Err(e) => Err(e),
    }
}

/// EXDEV on Unix is raw errno 18; Windows `ERROR_NOT_SAME_DEVICE` is 17.
/// Matching the raw code avoids depending on the unstable
/// `io::ErrorKind::CrossesDevices`.
fn is_cross_device(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(18) | Some(17))
}

fn copy_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dst).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn absent_config_resolves_to_default() {
        let d = TempDir::new().unwrap();
        let cfg = load(d.path());
        assert!(cfg.docs_root.is_none());
        assert_eq!(resolve_docs_dir(d.path(), &cfg), d.path().join("workspaces"));
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = TempDir::new().unwrap();
        let cfg = AppConfig {
            docs_root: Some("/abs/Houston".into()),
            migrate_from: None,
        };
        save(d.path(), &cfg).unwrap();
        let got = load(d.path());
        assert_eq!(got, cfg);
        assert_eq!(
            resolve_docs_dir(d.path(), &got),
            PathBuf::from("/abs/Houston")
        );
    }

    #[test]
    fn empty_or_whitespace_docs_root_falls_back_to_default() {
        let d = TempDir::new().unwrap();
        let cfg = AppConfig {
            docs_root: Some("   ".into()),
            migrate_from: None,
        };
        assert_eq!(resolve_docs_dir(d.path(), &cfg), d.path().join("workspaces"));
    }

    #[test]
    fn corrupt_config_is_default_not_panic() {
        let d = TempDir::new().unwrap();
        std::fs::write(d.path().join(FILE_NAME), "{not json").unwrap();
        assert_eq!(load(d.path()), AppConfig::default());
    }

    #[test]
    fn migrate_from_roundtrips_and_skips_when_none() {
        let d = TempDir::new().unwrap();
        // `migrate_from` absent → not serialized (additive, no key churn).
        save(d.path(), &AppConfig { docs_root: Some("/x".into()), migrate_from: None }).unwrap();
        let raw = std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap();
        assert!(!raw.contains("migrateFrom"));
        // present → roundtrips.
        save(
            d.path(),
            &AppConfig { docs_root: Some("/x".into()), migrate_from: Some("/old".into()) },
        )
        .unwrap();
        assert_eq!(load(d.path()).migrate_from.as_deref(), Some("/old"));
    }

    #[test]
    fn migrate_moves_tree_when_target_empty() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("Houston");
        std::fs::create_dir_all(old.join("Work/Agent")).unwrap();
        std::fs::write(old.join(MANIFEST), "[]").unwrap();
        std::fs::write(old.join("Work/Agent/CLAUDE.md"), "x").unwrap();

        assert!(migrate_docs_root(&old, &new).unwrap());
        assert!(new.join(MANIFEST).is_file());
        assert!(new.join("Work/Agent/CLAUDE.md").is_file());
        // Source fully drained.
        assert!(!old.join(MANIFEST).exists());
        // Second call is a no-op (old no longer has a manifest).
        assert!(!migrate_docs_root(&old, &new).unwrap());
    }

    #[test]
    fn migrate_noop_without_source_manifest() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        std::fs::create_dir_all(&old).unwrap();
        assert!(!migrate_docs_root(&old, &tmp.path().join("new")).unwrap());
    }

    #[test]
    fn migrate_never_clobbers_populated_target() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join(MANIFEST), "[\"old\"]").unwrap();
        std::fs::write(new.join(MANIFEST), "[\"new\"]").unwrap();
        assert!(!migrate_docs_root(&old, &new).unwrap());
        assert_eq!(
            std::fs::read_to_string(new.join(MANIFEST)).unwrap(),
            "[\"new\"]"
        );
    }

    #[test]
    fn migrate_noop_when_equal() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("Houston");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(MANIFEST), "[]").unwrap();
        assert!(!migrate_docs_root(&root, &root).unwrap());
        assert!(root.join(MANIFEST).is_file());
    }

    #[test]
    fn migrate_resumes_after_partial() {
        // Simulate an interrupted run: one agent dir already at the destination,
        // manifest still at source. A re-run must finish without clobbering and
        // without losing the already-moved dir.
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        std::fs::create_dir_all(old.join("A")).unwrap();
        std::fs::create_dir_all(old.join("B")).unwrap();
        std::fs::write(old.join(MANIFEST), "[]").unwrap();
        std::fs::create_dir_all(new.join("A")).unwrap(); // already moved
        std::fs::write(new.join("A/keep"), "1").unwrap();

        assert!(migrate_docs_root(&old, &new).unwrap());
        assert!(new.join("A/keep").is_file()); // pre-moved dir untouched
        assert!(new.join("B").is_dir()); // B finished
        assert!(new.join(MANIFEST).is_file());
    }

    #[test]
    fn paths_overlap_detects_nesting() {
        let tmp = TempDir::new().unwrap();
        let a = tmp.path().join("root");
        let b = a.join("inner");
        std::fs::create_dir_all(&b).unwrap();
        assert!(paths_overlap(&a, &b));
        assert!(paths_overlap(&b, &a));
        assert!(!paths_overlap(&a, &tmp.path().join("sibling")));
    }
}
