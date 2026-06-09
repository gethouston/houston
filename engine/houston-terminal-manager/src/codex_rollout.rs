//! Read accurate Codex context usage from the on-disk session rollout.
//!
//! `codex exec --json` only emits `turn.completed.usage`, which is the
//! CUMULATIVE sum of every model request in the turn (a turn with N tool
//! round-trips reports ~N× the real context size). The actual "current
//! context fill" — the input size of the LAST model request — and the
//! effective context window live only in the rollout's `token_count` events,
//! never in the exec stdout stream.
//!
//! Codex writes a rollout per session at
//! `$CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<ISO8601>-<thread_id>.jsonl`
//! (CODEX_HOME defaults to `~/.codex`). Each `token_count` event carries
//! `info.last_token_usage` (the last request) and `info.model_context_window`.
//! We locate the newest rollout for the thread and read its last
//! `token_count`, giving the same number Codex's own `/status` shows.
//!
//! This couples Houston to Codex's rollout format. It degrades gracefully:
//! any failure (file missing, format change, parse error) returns `None`, and
//! the caller leaves the Codex `FinalResult` usage unset rather than showing a
//! wrong (summed) number.

use crate::types::TokenUsage;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// The newest rollout for `thread_id`, parsed for its last `token_count`'s
/// `last_token_usage` → normalized [`TokenUsage`]. `None` when the rollout
/// can't be found, read, or parsed. Runs the blocking filesystem work on a
/// blocking thread so it never stalls the async stream reader.
pub async fn latest_usage(thread_id: &str) -> Option<TokenUsage> {
    let thread_id = thread_id.to_string();
    tokio::task::spawn_blocking(move || latest_usage_blocking(&thread_id))
        .await
        .ok()
        .flatten()
}

fn latest_usage_blocking(thread_id: &str) -> Option<TokenUsage> {
    let sessions = codex_sessions_dir()?;
    let path = newest_rollout_for_thread(&sessions, thread_id)?;
    let tail = read_rollout_tail(&path)?;
    parse_last_token_count(&tail)
}

/// Bytes of the rollout tail to scan. `token_count` events are a few hundred
/// bytes each and cluster at the end, so this covers the final turn's events
/// without reading a long-lived thread's multi-MB rollout on every turn.
const TAIL_BYTES: u64 = 64 * 1024;

/// Read the last [`TAIL_BYTES`] of the file as lossy UTF-8. A truncated leading
/// line is harmless — `parse_last_token_count` skips unparseable lines.
fn read_rollout_tail(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(TAIL_BYTES);
    if start > 0 {
        file.seek(SeekFrom::Start(start)).ok()?;
    }
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// `$CODEX_HOME/sessions`, falling back to `~/.codex/sessions`. Houston spawns
/// codex without overriding `CODEX_HOME`, so codex uses whatever the engine
/// inherited (the user's env) or its default — mirror that here.
fn codex_sessions_dir() -> Option<PathBuf> {
    Some(crate::prompt_scratch::codex_home()?.join("sessions"))
}

/// Walk the sessions tree for the newest rollout belonging to `thread_id`. A
/// resumed thread may have several rollout files (one per `codex exec resume`
/// invocation); the newest holds the most recent turn's usage.
///
/// Matches the exact filename grammar `rollout-<ISO8601>-<thread_id>.jsonl` by
/// the trailing `-<thread_id>.jsonl` token, NOT a substring — UUIDv7 thread ids
/// share timestamp prefixes, and Houston can run several codex agents against
/// the one `~/.codex/sessions` tree, so a substring match could pick a
/// concurrent session's rollout. Equal mtimes (coarse-granularity filesystems)
/// break deterministically by filename: the leading ISO8601 timestamp sorts
/// lexically by recency, so the genuinely-newest turn always wins.
fn newest_rollout_for_thread(sessions_dir: &Path, thread_id: &str) -> Option<PathBuf> {
    let suffix = format!("-{thread_id}.jsonl");
    let mut best: Option<(SystemTime, String, PathBuf)> = None;
    let mut stack = vec![sessions_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(entry.path());
                continue;
            }
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if !name.ends_with(&suffix) {
                continue;
            }
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            let is_newer = match &best {
                Some((best_mtime, best_name, _)) => {
                    mtime > *best_mtime || (mtime == *best_mtime && name > best_name.as_str())
                }
                None => true,
            };
            if is_newer {
                best = Some((mtime, name.to_string(), entry.path()));
            }
        }
    }
    best.map(|(_, _, path)| path)
}

/// Find the last `token_count` event in the rollout and read its
/// `last_token_usage`. Scans from the end because token_count events cluster
/// near the tail. `input_tokens` is the cache-inclusive prompt size of the
/// last request, i.e. the context-window fill — same as Codex `/status`.
fn parse_last_token_count(content: &str) -> Option<TokenUsage> {
    for line in content.lines().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let payload = value.get("payload")?;
        if payload.get("type").and_then(|t| t.as_str()) != Some("token_count") {
            continue;
        }
        let last = payload.get("info")?.get("last_token_usage")?;
        let field = |key: &str| last.get(key).and_then(|v| v.as_u64()).unwrap_or(0);
        return Some(TokenUsage {
            context_tokens: field("input_tokens"),
            output_tokens: field("output_tokens"),
            cached_tokens: field("cached_input_tokens"),
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // Verbatim shapes from a real rollout (codex 0.130/0.135,
    // ~/.codex/sessions/.../rollout-*.jsonl).
    const TOKEN_COUNT_1: &str = r#"{"timestamp":"2026-06-01T19:07:19.451Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":75279,"cached_input_tokens":49664,"output_tokens":336,"reasoning_output_tokens":108,"total_tokens":75615},"last_token_usage":{"input_tokens":18954,"cached_input_tokens":6528,"output_tokens":198,"reasoning_output_tokens":73,"total_tokens":19152},"model_context_window":258400}}}"#;
    const TOKEN_COUNT_2: &str = r#"{"timestamp":"2026-06-01T19:07:24.291Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":94673,"cached_input_tokens":68480,"output_tokens":435,"reasoning_output_tokens":108,"total_tokens":95108},"last_token_usage":{"input_tokens":19394,"cached_input_tokens":18816,"output_tokens":99,"reasoning_output_tokens":0,"total_tokens":19493},"model_context_window":258400}}}"#;
    const OTHER: &str = r#"{"timestamp":"2026-06-01T19:07:12.986Z","type":"event_msg","payload":{"type":"task_started","turn_id":"t1","model_context_window":258400}}"#;

    #[test]
    fn reads_last_token_count_not_cumulative() {
        let content = format!("{OTHER}\n{TOKEN_COUNT_1}\n{TOKEN_COUNT_2}\n");
        let usage = parse_last_token_count(&content).expect("parses");
        // The LAST token_count's last_token_usage — the real context fill —
        // NOT the cumulative total (94673) the exec stream reports.
        assert_eq!(usage.context_tokens, 19394);
        assert_eq!(usage.cached_tokens, 18816);
        assert_eq!(usage.output_tokens, 99);
    }

    #[test]
    fn picks_final_token_count_when_trailing_non_token_lines() {
        // A trailing task_complete line after the last token_count must not
        // hide the usage — reverse scan skips non-token_count lines.
        let content = format!("{TOKEN_COUNT_1}\n{TOKEN_COUNT_2}\n{OTHER}\n");
        let usage = parse_last_token_count(&content).expect("parses");
        assert_eq!(usage.context_tokens, 19394);
    }

    #[test]
    fn none_when_no_token_count() {
        let content = format!("{OTHER}\n{OTHER}\n");
        assert!(parse_last_token_count(&content).is_none());
    }

    #[test]
    fn none_on_garbage() {
        assert!(parse_last_token_count("not json\n\n").is_none());
        assert!(parse_last_token_count("").is_none());
    }
}
