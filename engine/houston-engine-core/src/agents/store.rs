//! Shared helpers for typed JSON I/O under `.houston/<type>/<type>.json`.
//!
//! Delegates atomic writes + path-traversal safety to `houston-agent-files`.

use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use houston_agent_files as files;
use once_cell::sync::Lazy;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

static JSON_FILE_LOCKS: Lazy<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Returns the `.houston/` directory inside an agent root.
pub fn houston_dir(root: &Path) -> PathBuf {
    root.join(".houston")
}

/// Creates `.houston/` if it doesn't exist.
pub fn ensure_houston_dir(root: &Path) -> CoreResult<()> {
    let dir = houston_dir(root);
    std::fs::create_dir_all(&dir).map_err(|e| {
        CoreError::Internal(format!("failed to create .houston directory: {e}"))
    })?;
    Ok(())
}

/// Build the relative path for a given type: `.houston/<name>/<name>.json`.
fn rel_path(name: &str) -> String {
    format!(".houston/{name}/{name}.json")
}

pub fn with_json_file_lock<T>(
    root: &Path,
    name: &str,
    f: impl FnOnce() -> CoreResult<T>,
) -> CoreResult<T> {
    let rel = rel_path(name);
    let key = root.join(&rel);
    let lock = {
        let mut locks = JSON_FILE_LOCKS
            .lock()
            .map_err(|_| CoreError::Internal(format!("{rel} lock registry poisoned")))?;
        locks
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = lock
        .lock()
        .map_err(|_| CoreError::Internal(format!("{rel} lock poisoned")))?;
    f()
}

/// Read and deserialize `.houston/<name>/<name>.json`.
///
/// Resilient by design — a corrupt `.houston` data file must never
/// permanently brick the surface that reads it (HOU-436: a malformed
/// `routines.json` made every `list_routines` call 500 with `json error:
/// expected value at line 1 column 1`). Recovery, least-lossy first:
/// - missing, empty, or whitespace-only file → `T::default()`
/// - a leading UTF-8 BOM (U+FEFF) is stripped before parsing; serde_json
///   does not skip one, so a BOM-prefixed file otherwise fails at line 1
///   column 1 (editors, cloud-sync, and Windows writers all emit BOMs)
/// - one valid value followed by trailing junk → keep the first value
/// - otherwise unparseable → reset to `T::default()`
///
/// Every recovery that mutates the file first preserves the original bytes
/// as a timestamped `.bak` and logs a warning, so nothing is lost silently.
pub fn read_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
) -> CoreResult<T> {
    let rel = rel_path(name);
    let raw = files::read_file(root, &rel)
        .map_err(|e| CoreError::Internal(format!("failed to read {rel}: {e}")))?;
    let contents = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    if contents.trim().is_empty() {
        return Ok(T::default());
    }
    match serde_json::from_str(contents) {
        Ok(value) => Ok(value),
        Err(err) => repair_json(root, name, &rel, contents, &err),
    }
}

/// Atomically write a typed value as `.houston/<name>/<name>.json`.
pub fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    let rel = rel_path(name);
    let body = serde_json::to_string_pretty(data)?;
    files::write_file_atomic(root, &rel, &body)
        .map_err(|e| CoreError::Internal(format!("failed to write {rel}: {e}")))
}

/// Recover a `.houston` JSON file that failed to parse. Least-lossy salvage
/// first (one valid value + trailing junk → keep the value), then reset to
/// `T::default()`. Either way the original bytes are preserved as a `.bak`
/// and a warning logged, so a corrupt data file degrades to an empty surface
/// rather than hard-erroring the read (HOU-436). A backup-write failure still
/// surfaces — that's a real, actionable error, not a recoverable one.
fn repair_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
    rel: &str,
    contents: &str,
    err: &serde_json::Error,
) -> CoreResult<T> {
    if let Some(value) = parse_first_json_value::<T>(contents) {
        backup_and_write(root, name, contents, &value)?;
        tracing::warn!(
            file = rel,
            error = %err,
            "repaired JSON file by removing trailing data"
        );
        return Ok(value);
    }

    let value = T::default();
    backup_and_write(root, name, contents, &value)?;
    tracing::warn!(
        file = rel,
        error = %err,
        "reset corrupt JSON file to default after preserving backup"
    );
    Ok(value)
}

fn parse_first_json_value<T: DeserializeOwned>(contents: &str) -> Option<T> {
    let mut stream = serde_json::Deserializer::from_str(contents).into_iter::<T>();
    let first = stream.next()?.ok()?;
    let trailing = &contents[stream.byte_offset()..];
    if trailing.trim().is_empty() {
        return None;
    }
    Some(first)
}

fn backup_and_write<T: Serialize>(
    root: &Path,
    name: &str,
    contents: &str,
    value: &T,
) -> CoreResult<()> {
    let backup_rel = format!(
        ".houston/{name}/{name}.json.corrupt-{}-{}.bak",
        Utc::now().format("%Y%m%dT%H%M%S%3fZ"),
        Uuid::new_v4()
    );
    files::write_file_atomic(root, &backup_rel, contents)
        .map_err(|e| CoreError::Internal(format!("failed to back up corrupt JSON: {e}")))?;
    write_json(root, name, value)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const NAME: &str = "routines";

    fn write_raw(root: &Path, name: &str, body: &str) {
        let dir = houston_dir(root).join(name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{name}.json")), body).unwrap();
    }

    fn has_backup(root: &Path, name: &str) -> bool {
        std::fs::read_dir(houston_dir(root).join(name))
            .map(|rd| {
                rd.filter_map(Result::ok)
                    .any(|e| e.file_name().to_string_lossy().contains(".corrupt-"))
            })
            .unwrap_or(false)
    }

    #[test]
    fn missing_file_reads_as_default() {
        let d = TempDir::new().unwrap();
        let v: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert!(v.is_empty());
        assert!(!has_backup(d.path(), NAME));
    }

    #[test]
    fn whitespace_only_reads_as_default_without_backup() {
        let d = TempDir::new().unwrap();
        write_raw(d.path(), NAME, "  \n\t  ");
        let v: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert!(v.is_empty());
        assert!(!has_backup(d.path(), NAME), "blank file is not a corruption");
    }

    #[test]
    fn bom_prefixed_json_parses_losslessly() {
        // A leading UTF-8 BOM is the textbook `expected value at line 1
        // column 1` serde failure (HOU-436). It must parse, not reset.
        let d = TempDir::new().unwrap();
        write_raw(d.path(), NAME, "\u{feff}[1, 2, 3]");
        let v: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert_eq!(v, vec![1, 2, 3]);
        assert!(!has_backup(d.path(), NAME), "BOM strip is lossless, no backup");
    }

    #[test]
    fn unparseable_resets_to_default_and_backs_up() {
        // Reaches the generalized reset path for a non-`routine_runs` file —
        // the bug was that this hard-errored instead of recovering.
        let d = TempDir::new().unwrap();
        write_raw(d.path(), NAME, "this is not json at all");
        let v: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert!(v.is_empty());
        assert!(has_backup(d.path(), NAME), "corrupt bytes preserved in .bak");
        // File now holds the reset default, so a re-read is clean.
        let again: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert!(again.is_empty());
    }

    #[test]
    fn trailing_junk_keeps_first_value_and_backs_up() {
        let d = TempDir::new().unwrap();
        write_raw(d.path(), NAME, "[1, 2, 3]\n[4, 5]");
        let v: Vec<i64> = read_json(d.path(), NAME).unwrap();
        assert_eq!(v, vec![1, 2, 3], "first value salvaged, trailing dropped");
        assert!(has_backup(d.path(), NAME));
    }
}
