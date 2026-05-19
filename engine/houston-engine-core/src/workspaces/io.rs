//! Workspace index file I/O: read, atomic write, and self-healing recovery.
//!
//! The recovery path exists because 0.4.19 shipped a writer that shared a
//! single `workspaces.json.tmp` path across all callers. Two concurrent
//! writes could race on that path and commit a target file with valid JSON
//! followed by a few leftover bytes from the longer writer. The new writer
//! uses a per-call tmp filename so the race cannot recur; the reader still
//! knows how to fix existing files in the field.

use super::Workspace;
use crate::error::CoreResult;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(super) fn json_path(root: &Path) -> PathBuf {
    root.join("workspaces.json")
}

pub fn read_all(root: &Path) -> CoreResult<Vec<Workspace>> {
    let path = json_path(root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)?;
    match serde_json::from_str::<Vec<Workspace>>(&contents) {
        Ok(v) => Ok(v),
        Err(e) => recover_trailing_garbage(&path, &contents, e),
    }
}

pub(super) fn write_all(root: &Path, workspaces: &[Workspace]) -> CoreResult<()> {
    fs::create_dir_all(root)?;
    write_atomic(root, workspaces)
}

fn write_atomic(root: &Path, workspaces: &[Workspace]) -> CoreResult<()> {
    let target = json_path(root);
    let tmp = root.join(format!("workspaces.json.{}.tmp", Uuid::new_v4()));
    let json = serde_json::to_string_pretty(workspaces)?;
    if let Err(e) = fs::write(&tmp, &json) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn recover_trailing_garbage(
    path: &Path,
    contents: &str,
    original: serde_json::Error,
) -> CoreResult<Vec<Workspace>> {
    let bracket_positions: Vec<usize> = contents.match_indices(']').map(|(i, _)| i).collect();
    let mut recovered: Option<(Vec<Workspace>, usize)> = None;
    for end in bracket_positions.into_iter().rev() {
        let prefix = &contents[..=end];
        if let Ok(v) = serde_json::from_str::<Vec<Workspace>>(prefix) {
            recovered = Some((v, end + 1));
            break;
        }
    }
    let (parsed, consumed) = match recovered {
        Some(r) => r,
        None => return Err(original.into()),
    };
    let dropped = contents.len().saturating_sub(consumed);
    if let Some(root) = path.parent() {
        if let Err(e) = write_atomic(root, &parsed) {
            tracing::warn!(
                "[workspaces] recovered {} from corrupt {} but failed to re-save: {e}",
                parsed.len(),
                path.display()
            );
            return Ok(parsed);
        }
    }
    tracing::warn!(
        "[workspaces] repaired corrupt {} — recovered {} entries, dropped {} trailing bytes",
        path.display(),
        parsed.len(),
        dropped
    );
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    /// Reproduces the 0.4.19 corruption shape: valid JSON array followed by
    /// trailing bytes ` }\n]`. `read_all` must recover the valid prefix and
    /// repair the file on disk.
    #[test]
    fn read_recovers_from_trailing_garbage() {
        let d = tmp();
        fs::create_dir_all(d.path()).unwrap();
        let valid = r#"[
  {
    "id": "5ae9e699-a5d7-4f8a-9ae1-17be89aafcf9",
    "name": "Personal",
    "isDefault": false,
    "createdAt": "2026-05-15T13:39:01.200349+00:00",
    "provider": "anthropic",
    "model": "sonnet"
  }
]"#;
        let corrupt = format!("{valid} }}\n]");
        fs::write(d.path().join("workspaces.json"), &corrupt).unwrap();

        let got = read_all(d.path()).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].name, "Personal");

        let on_disk = fs::read_to_string(d.path().join("workspaces.json")).unwrap();
        let reparsed: Vec<Workspace> = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(reparsed.len(), 1);
        assert_eq!(reparsed[0].name, "Personal");
    }

    /// Truly malformed JSON (not "valid prefix + trailing junk") must still
    /// error. We don't want recovery to silently mask bad files.
    #[test]
    fn read_errors_on_unrecoverable_json() {
        let d = tmp();
        fs::create_dir_all(d.path()).unwrap();
        fs::write(d.path().join("workspaces.json"), "{not json at all").unwrap();
        assert!(read_all(d.path()).is_err());
    }
}
