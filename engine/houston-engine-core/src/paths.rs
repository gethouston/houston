//! Filesystem path resolution for the engine.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Expand a leading `~` to the user's home directory. Mirrors the Tauri-side
/// helper so REST callers can submit `~/Documents/Houston/...` paths verbatim.
///
/// Cross-platform: uses `dirs::home_dir()` instead of `$HOME` so Windows
/// (which sets `%USERPROFILE%` and not `HOME`) also resolves correctly.
pub fn expand_tilde(path: &Path) -> PathBuf {
    if path.starts_with("~") {
        if let Some(home) = dirs::home_dir() {
            return home.join(path.strip_prefix("~").unwrap_or(path));
        }
    }
    path.to_path_buf()
}

/// True when `a` and `b` resolve to the same filesystem entity.
///
/// Canonicalizing both sides collapses case differences on case-insensitive
/// filesystems (Windows, default macOS) — where a case-only rename target like
/// `PERa` already "exists" because it resolves to the existing `PERA` — and
/// resolves symlinks to their target. On case-sensitive filesystems the two
/// paths stay distinct, so genuine name collisions are still reported.
///
/// Falls back to a literal comparison when either path cannot be canonicalized
/// (e.g. the destination does not exist yet, which is the common no-collision
/// case).
pub fn same_fs_entity(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => a == b,
    }
}

/// Rename `from` to `to`, tolerating a case-only change on case-insensitive
/// filesystems.
///
/// A direct `fs::rename("PERA", "PERa")` can be rejected on Windows because the
/// destination resolves to the source, so the OS reports it as already
/// existing. When `from` and `to` are the same entity spelled differently, hop
/// through a unique temporary name in the destination's parent so the move
/// always lands. Everything else is a plain `fs::rename`.
pub fn rename_path(from: &Path, to: &Path) -> io::Result<()> {
    if from == to {
        return Ok(());
    }
    if same_fs_entity(from, to) {
        let parent = to.parent().unwrap_or_else(|| Path::new("."));
        let tmp = parent.join(format!(".houston-rename-{}", Uuid::new_v4()));
        fs::rename(from, &tmp)?;
        fs::rename(&tmp, to)?;
        Ok(())
    } else {
        fs::rename(from, to)
    }
}

#[derive(Clone, Debug)]
pub struct EnginePaths {
    /// Houston docs directory — holds workspaces (`~/Documents/Houston`).
    pub docs_dir: PathBuf,
    /// Houston home directory — holds `engine.json`, DB (`~/.houston`).
    pub home_dir: PathBuf,
}

impl EnginePaths {
    pub fn new(docs_dir: PathBuf, home_dir: PathBuf) -> Self {
        Self { docs_dir, home_dir }
    }

    pub fn docs(&self) -> &Path {
        &self.docs_dir
    }

    pub fn home(&self) -> &Path {
        &self.home_dir
    }

    /// Installed-agent definitions: `<home>/agents`.
    pub fn agents_dir(&self) -> PathBuf {
        self.home_dir.join("agents")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn same_fs_entity_identical_path() {
        let d = TempDir::new().unwrap();
        let p = d.path().join("agent");
        fs::create_dir(&p).unwrap();
        assert!(same_fs_entity(&p, &p));
    }

    #[test]
    fn same_fs_entity_distinct_dirs() {
        let d = TempDir::new().unwrap();
        let a = d.path().join("a");
        let b = d.path().join("b");
        fs::create_dir(&a).unwrap();
        fs::create_dir(&b).unwrap();
        assert!(!same_fs_entity(&a, &b));
    }

    #[test]
    fn same_fs_entity_missing_destination_is_not_same() {
        let d = TempDir::new().unwrap();
        let a = d.path().join("a");
        let b = d.path().join("b"); // never created
        fs::create_dir(&a).unwrap();
        assert!(!same_fs_entity(&a, &b));
    }

    #[test]
    fn rename_path_plain_move() {
        let d = TempDir::new().unwrap();
        let from = d.path().join("alpha");
        let to = d.path().join("beta");
        fs::create_dir(&from).unwrap();
        rename_path(&from, &to).unwrap();
        assert!(to.exists());
        let names: Vec<String> = fs::read_dir(d.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["beta".to_string()]);
    }

    /// Case-only rename must succeed on every filesystem and leave exactly one
    /// directory under the new spelling — no leftover temp dir, no duplicate.
    /// On case-insensitive filesystems this exercises the temp-hop path; on
    /// case-sensitive ones it is a plain move. Both must converge to `case`.
    #[test]
    fn rename_path_case_only_change() {
        let d = TempDir::new().unwrap();
        let from = d.path().join("CASE");
        let to = d.path().join("case");
        fs::create_dir(&from).unwrap();
        fs::write(from.join("marker"), "x").unwrap();

        rename_path(&from, &to).unwrap();

        let names: Vec<String> = fs::read_dir(d.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["case".to_string()]);
        assert!(to.join("marker").exists(), "contents must survive the move");
    }

    #[test]
    fn rename_path_identical_is_noop() {
        let d = TempDir::new().unwrap();
        let p = d.path().join("agent");
        fs::create_dir(&p).unwrap();
        rename_path(&p, &p).unwrap();
        assert!(p.exists());
    }
}
