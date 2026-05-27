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
/// Returns `T::default()` if the file does not exist or is empty.
pub fn read_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
) -> CoreResult<T> {
    let rel = rel_path(name);
    let contents = files::read_file(root, &rel)
        .map_err(|e| CoreError::Internal(format!("failed to read {rel}: {e}")))?;
    if contents.is_empty() {
        return Ok(T::default());
    }
    match serde_json::from_str(&contents) {
        Ok(value) => Ok(value),
        Err(err) => match repair_json(root, name, &rel, &contents, &err)? {
            Some(value) => Ok(value),
            None => Err(err.into()),
        },
    }
}

/// Atomically write a typed value as `.houston/<name>/<name>.json`.
pub fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    let rel = rel_path(name);
    let body = serde_json::to_string_pretty(data)?;
    files::write_file_atomic(root, &rel, &body)
        .map_err(|e| CoreError::Internal(format!("failed to write {rel}: {e}")))
}

fn repair_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
    rel: &str,
    contents: &str,
    err: &serde_json::Error,
) -> CoreResult<Option<T>> {
    if let Some(value) = parse_first_json_value(contents) {
        backup_and_write(root, name, contents, &value)?;
        tracing::warn!(
            file = rel,
            error = %err,
            "repaired JSON file by removing trailing data"
        );
        return Ok(Some(value));
    }

    if name == "routine_runs" {
        let value = T::default();
        backup_and_write(root, name, contents, &value)?;
        tracing::warn!(
            file = rel,
            error = %err,
            "reset corrupt routine run history after preserving backup"
        );
        return Ok(Some(value));
    }

    Ok(None)
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
