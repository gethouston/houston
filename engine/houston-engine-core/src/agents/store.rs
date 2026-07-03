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
/// - unescaped control characters inside a string literal (a raw newline or
///   tab an external editor, sync client, or agent wrote into a multi-line
///   value) are escaped in place and the document re-parsed — lossless, so
///   every record survives (HOU-494: a routine `prompt` carried a literal
///   newline, making routines.json unparseable, and the reset path below then
///   wiped every routine)
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

/// Recover a `.houston` JSON file that failed to parse. Least-lossy first:
/// 1. escape unescaped control characters inside string literals and re-parse
///    — lossless, recovers every record (HOU-494);
/// 2. one valid value + trailing junk → keep the first value (drops the junk);
/// 3. reset to `T::default()` (last resort, drops everything).
/// Either way the original bytes are preserved as a `.bak` and a warning
/// logged, so a corrupt data file degrades gracefully rather than
/// hard-erroring the read (HOU-436). A backup-write failure still surfaces —
/// that's a real, actionable error, not a recoverable one.
fn repair_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
    rel: &str,
    contents: &str,
    err: &serde_json::Error,
) -> CoreResult<T> {
    // The most common external-writer corruption: a literal control char (a
    // raw newline/tab a sync client, editor, or agent dropped into a
    // multi-line value) inside a JSON string. serde rejects it with "control
    // character (\u0000-\u001F) found while parsing a string". Escaping it in
    // place is lossless — the string's logical content is identical — so once
    // it parses, every record is recovered. Compose with the trailing-junk
    // salvage below by running both against the escaped text.
    let escaped = escape_control_chars_in_strings(contents);
    let effective = escaped.as_deref().unwrap_or(contents);

    if escaped.is_some() {
        if let Ok(value) = serde_json::from_str::<T>(effective) {
            backup_and_write(root, name, contents, &value)?;
            tracing::warn!(
                file = rel,
                error = %err,
                "repaired JSON file by escaping unescaped control characters"
            );
            return Ok(value);
        }
    }

    if let Some(value) = parse_first_json_value::<T>(effective) {
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

/// Escape literal control characters (U+0000–U+001F) that appear *inside* JSON
/// string literals, leaving structural whitespace between tokens untouched.
///
/// JSON forbids raw control chars in strings, so serde fails the whole parse on
/// the first one ("control character (\u0000-\u001F) found while parsing a
/// string"). An external editor, sync client, or agent that rewrites a
/// `.houston` file and splices a raw newline/tab into a multi-line value
/// produces exactly this (HOU-494). Re-encoding each offender to its escape
/// (`\n`, `\r`, `\t`, else `\u00xx`) preserves the value byte-for-byte once
/// decoded.
///
/// Returns `None` when nothing needed escaping, so a file that failed to parse
/// for some other reason is not pointlessly rewritten.
fn escape_control_chars_in_strings(contents: &str) -> Option<String> {
    let mut out = String::with_capacity(contents.len());
    let mut in_string = false;
    // Whether the previous char inside a string was a lone backslash, so the
    // current char is part of an escape sequence and must pass through verbatim.
    let mut after_backslash = false;
    let mut changed = false;

    for ch in contents.chars() {
        if !in_string {
            if ch == '"' {
                in_string = true;
            }
            out.push(ch);
            continue;
        }
        if after_backslash {
            out.push(ch);
            after_backslash = false;
            continue;
        }
        match ch {
            '\\' => {
                out.push(ch);
                after_backslash = true;
            }
            '"' => {
                out.push(ch);
                in_string = false;
            }
            c if (c as u32) < 0x20 => {
                match c {
                    '\n' => out.push_str("\\n"),
                    '\r' => out.push_str("\\r"),
                    '\t' => out.push_str("\\t"),
                    other => out.push_str(&format!("\\u{:04x}", other as u32)),
                }
                changed = true;
            }
            _ => out.push(ch),
        }
    }

    changed.then_some(out)
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

    #[test]
    fn unescaped_newline_in_string_recovers_every_record_losslessly() {
        // HOU-494: an external writer (sync client / editor / agent) spliced a
        // raw newline into a multi-line string value, so serde failed the whole
        // parse with "control character (\u0000-\u001F) found while parsing a
        // string". The old reset path then wiped EVERY record. The repair must
        // escape the stray newline and recover all values, newline intact.
        let d = TempDir::new().unwrap();
        // The `\n` between "line1" and "line2" is a real newline byte sitting
        // INSIDE the JSON string — exactly the corruption seen on disk.
        write_raw(d.path(), NAME, "[\"keep me\", \"line1\nline2\"]");

        let v: Vec<String> = read_json(d.path(), NAME).unwrap();
        assert_eq!(v, vec!["keep me".to_string(), "line1\nline2".to_string()]);
        assert!(has_backup(d.path(), NAME), "original bytes preserved in .bak");

        // File was rewritten as valid JSON, so a re-read is clean and does NOT
        // produce a second backup (no repeated corruption every poll).
        let again: Vec<String> = read_json(d.path(), NAME).unwrap();
        assert_eq!(again, v);
        let backups = std::fs::read_dir(houston_dir(d.path()).join(NAME))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt-"))
            .count();
        assert_eq!(backups, 1, "recovery is one-shot, not re-triggered on re-read");
    }

    #[test]
    fn escapes_tab_and_carriage_return_inside_strings() {
        let d = TempDir::new().unwrap();
        // Raw TAB and CR bytes inside the string value.
        write_raw(d.path(), NAME, "[\"a\tb\rc\"]");
        let v: Vec<String> = read_json(d.path(), NAME).unwrap();
        assert_eq!(v, vec!["a\tb\rc".to_string()]);
        assert!(has_backup(d.path(), NAME));
    }

    #[test]
    fn control_char_repair_composes_with_trailing_junk_salvage() {
        // Compound corruption: a raw newline inside a string AND trailing junk.
        // Escaping runs first, then the first-value salvage drops the junk.
        let d = TempDir::new().unwrap();
        write_raw(d.path(), NAME, "[\"a\nb\"]\n[\"junk\"]");
        let v: Vec<String> = read_json(d.path(), NAME).unwrap();
        assert_eq!(v, vec!["a\nb".to_string()], "newline escaped, trailing dropped");
        assert!(has_backup(d.path(), NAME));
    }

    #[test]
    fn escape_control_chars_leaves_structural_whitespace_and_valid_strings_alone() {
        // A newline BETWEEN tokens is structural JSON whitespace, not a string
        // control char — it must not be touched (else we'd rewrite files that
        // failed to parse for unrelated reasons).
        assert!(escape_control_chars_in_strings("[1,\n2]").is_none());
        // Already-escaped content is untouched too.
        assert!(escape_control_chars_in_strings("[\"a\\nb\"]").is_none());
        // A raw newline inside a string IS rewritten to the `\n` escape.
        assert_eq!(
            escape_control_chars_in_strings("[\"a\nb\"]").as_deref(),
            Some("[\"a\\nb\"]"),
        );
    }
}
