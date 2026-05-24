//! Append-only webhook delivery ledger — the idempotency backbone.
//!
//! Linear delivers webhooks at-least-once. Every accepted delivery
//! appends one JSON line to
//! `.houston/trackers/linear/raw/webhook_events.jsonl`. Subsequent
//! deliveries with the same Linear-provided `webhookId` are
//! recognized via a linear scan and dedupe-skipped.
//!
//! ## Why JSONL on disk?
//!
//! - **Crash-safe**: append-only writes are atomic at the line level on
//!   POSIX filesystems for small lines (< PIPE_BUF, 4 KB on macOS).
//!   Linear's payloads sit comfortably under this.
//! - **Replayable**: the ledger IS the projection source. If
//!   `issues.json` ever gets corrupted, we re-derive it from the raw
//!   stream.
//! - **No DB**: Houston ships zero-config; users don't install Postgres
//!   to use the desktop app.
//! - **Small**: Linear sends < 1KB per event; 10K events ≈ 10 MB. We
//!   never compact (the audit trail is the point).
//!
//! ## Why linear scan?
//!
//! At V1 sizes (hundreds of issues per workspace, ones of teams), the
//! ledger never exceeds ~10 K lines. Linear scan is O(n) but n is
//! small and disk reads are sequential. A hash index becomes worthwhile
//! at the 100 K-event point — `bookkeeping.py`-style consolidation,
//! tracked as a rule-of-three candidate.

use crate::error::LinearError;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// One line in `raw/webhook_events.jsonl`.
///
/// `webhook_id` is the dedup key — Linear's per-delivery UUID at the
/// top of every payload. `payload` keeps the raw bytes-as-JSON for
/// idempotent reprojection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    /// Linear's per-delivery UUID (top-level `webhookId`).
    pub webhook_id: String,
    /// Engine wall-clock at receipt (RFC-3339 UTC).
    pub delivered_at: String,
    /// `Issue` / `Project` / `Cycle` / `AgentSessionEvent` / ...
    #[serde(rename = "type")]
    pub event_type: String,
    /// `create` / `update` / `remove`.
    pub action: String,
    /// Full raw payload as Linear delivered it.
    pub payload: serde_json::Value,
}

/// Outcome of attempting to record a delivery.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordOutcome {
    /// First time we've seen this `webhookId` — line appended.
    Recorded,
    /// Already on disk — no side effect.
    Duplicate,
}

/// On-disk location of the ledger for a given workspace.
pub fn path_for(workspace_path: &Path) -> PathBuf {
    workspace_path
        .join(".houston")
        .join("trackers")
        .join("linear")
        .join("raw")
        .join("webhook_events.jsonl")
}

/// Dedupe-check then append.
///
/// Reads the existing ledger top-to-bottom; if any line carries the
/// same `webhookId`, returns [`RecordOutcome::Duplicate`] without
/// touching the file. Otherwise serialises `entry` to one line and
/// appends.
///
/// Parent dirs are created lazily on first write (so seeding the
/// `.houston/trackers/linear/raw/` hierarchy is not a precondition).
pub fn record_if_new(
    workspace_path: &Path,
    entry: LedgerEntry,
) -> Result<RecordOutcome, LinearError> {
    let path = path_for(workspace_path);

    if is_duplicate(&path, &entry.webhook_id)? {
        return Ok(RecordOutcome::Duplicate);
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| LinearError::Io(format!("create ledger dir: {e}")))?;
    }

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|e| LinearError::Io(format!("open ledger: {e}")))?;
    let line = serde_json::to_string(&entry).map_err(LinearError::Json)?;
    writeln!(file, "{line}").map_err(|e| LinearError::Io(format!("write ledger: {e}")))?;

    Ok(RecordOutcome::Recorded)
}

/// Scan the ledger for a matching `webhookId`. Missing file returns
/// `false` (a never-written ledger has no duplicates).
fn is_duplicate(path: &Path, webhook_id: &str) -> Result<bool, LinearError> {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(LinearError::Io(format!("open ledger for scan: {e}"))),
    };

    #[derive(Deserialize)]
    struct IdProbe {
        #[serde(rename = "webhookId")]
        webhook_id: String,
    }

    for line in BufReader::new(file).lines() {
        let line = line.map_err(|e| LinearError::Io(format!("read ledger line: {e}")))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Skip malformed lines silently — a single corrupted append
        // shouldn't make every subsequent delivery a duplicate-false-
        // negative. The corruption itself is visible (the line is on
        // disk for debugging).
        let Ok(probe) = serde_json::from_str::<IdProbe>(trimmed) else {
            continue;
        };
        if probe.webhook_id == webhook_id {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_entry(id: &str) -> LedgerEntry {
        LedgerEntry {
            webhook_id: id.into(),
            delivered_at: "2026-05-23T01:23:45Z".into(),
            event_type: "Issue".into(),
            action: "create".into(),
            payload: serde_json::json!({"webhookId": id, "data": {"id": "x"}}),
        }
    }

    #[test]
    fn path_layout_matches_spec() {
        let p = path_for(Path::new("/tmp/Agent"));
        assert_eq!(
            p,
            PathBuf::from("/tmp/Agent/.houston/trackers/linear/raw/webhook_events.jsonl")
        );
    }

    #[test]
    fn first_record_is_recorded() {
        let dir = TempDir::new().unwrap();
        let outcome = record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        assert_eq!(outcome, RecordOutcome::Recorded);
    }

    #[test]
    fn second_record_with_same_id_is_duplicate() {
        let dir = TempDir::new().unwrap();
        record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        let outcome = record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        assert_eq!(outcome, RecordOutcome::Duplicate);
    }

    #[test]
    fn different_ids_both_recorded() {
        let dir = TempDir::new().unwrap();
        let a = record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        let b = record_if_new(dir.path(), sample_entry("evt-2")).unwrap();
        assert_eq!(a, RecordOutcome::Recorded);
        assert_eq!(b, RecordOutcome::Recorded);

        let contents = std::fs::read_to_string(path_for(dir.path())).unwrap();
        let lines: Vec<_> = contents.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("evt-1"));
        assert!(lines[1].contains("evt-2"));
    }

    #[test]
    fn ledger_is_append_only_not_truncated() {
        let dir = TempDir::new().unwrap();
        record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        record_if_new(dir.path(), sample_entry("evt-2")).unwrap();
        record_if_new(dir.path(), sample_entry("evt-3")).unwrap();

        let contents = std::fs::read_to_string(path_for(dir.path())).unwrap();
        assert_eq!(contents.lines().count(), 3);
    }

    #[test]
    fn corrupted_line_does_not_break_dedup() {
        let dir = TempDir::new().unwrap();
        let path = path_for(dir.path());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // Write a malformed line then a valid one.
        std::fs::write(&path, "not json\n").unwrap();
        record_if_new(dir.path(), sample_entry("evt-1")).unwrap();

        // Re-record the same id — should still see the duplicate
        // despite the leading malformed line.
        let outcome = record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        assert_eq!(outcome, RecordOutcome::Duplicate);
    }

    #[test]
    fn missing_ledger_means_no_duplicates() {
        let dir = TempDir::new().unwrap();
        // Don't pre-create the file; record_if_new should succeed.
        let outcome = record_if_new(dir.path(), sample_entry("evt-1")).unwrap();
        assert_eq!(outcome, RecordOutcome::Recorded);
    }
}
