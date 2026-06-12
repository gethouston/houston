//! Stable Sentry issue grouping for engine events (HOU-449).
//!
//! A `tracing::error!` whose message embeds volatile data — a serde line/column
//! number, the local sidecar's random port, a UUID, a hex status code — lands
//! as a SEPARATE Sentry issue every time that data changes, so ONE logical bug
//! fans out into dozens of near-identical issues. The worst offender is the
//! Codex NDJSON parser (`codex_parser.rs`):
//!
//! ```text
//! Failed to parse Codex event: invalid type: null, expected i32 at line 1 column 190
//! Line: {…the whole raw frame…}
//! ```
//!
//! The column moves with every malformed frame AND the raw frame is appended on
//! a second line, so the default message grouping never collapses the family —
//! ~50 issues for the single parser bug at last count.
//!
//! This `before_send` step derives a deterministic fingerprint from the FIRST
//! line of the event message with volatile tokens masked, so the whole family
//! collapses into ONE issue. It mirrors the frontend's
//! `app/src/lib/sentry-fingerprint.ts` and the supervisor's explicit
//! `engine-subprocess-exit` fingerprint. An event that already carries a custom
//! fingerprint (a deliberate `scope.set_fingerprint`) is left untouched, and an
//! event with no usable message keeps Sentry's default grouping.

use std::borrow::Cow;
use std::sync::LazyLock;

use regex::Regex;
use sentry::protocol::Event;

/// A UUID anywhere in the string (agent / workspace / session ids, composio keys).
static UUID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b").unwrap()
});
/// An IPv4 address with an optional `:port` — the local sidecar's
/// `127.0.0.1:<random port>`, which changes on every engine restart.
static ADDR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b").unwrap());
/// A hex literal — `0xc000001d` Windows status codes, pointers.
static HEX_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b0x[0-9a-f]+\b").unwrap());
/// Any remaining run of digits — serde line/column, byte indices, os error codes.
static NUM_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d+").unwrap());
/// Collapsible whitespace.
static WS_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

const MAX_KEY_LEN: usize = 200;

/// Normalize a message into a stable grouping key: take the first line, mask
/// every volatile token, collapse whitespace, trim, and cap the length. Pure so
/// it can be unit-tested against verbatim Sentry titles.
///
/// Ordering matters: UUID / IPv4 / hex are masked BEFORE the bare-digit pass so
/// their internal digits don't get half-eaten into `{n}` first.
pub fn normalize_fingerprint_message(raw: &str) -> String {
    let first_line = raw.split('\n').next().unwrap_or(raw);
    let masked = UUID_RE.replace_all(first_line, "{uuid}");
    let masked = ADDR_RE.replace_all(&masked, "{addr}");
    let masked = HEX_RE.replace_all(&masked, "{hex}");
    let masked = NUM_RE.replace_all(&masked, "{n}");
    let collapsed = WS_RE.replace_all(&masked, " ");
    collapsed.trim().chars().take(MAX_KEY_LEN).collect()
}

/// True if `fp` is Sentry's default fingerprint (`["{{ default }}"]`) or empty —
/// i.e. nothing deliberate was set, so we may override it.
fn is_default_fingerprint(fp: &[Cow<'_, str>]) -> bool {
    fp.is_empty() || (fp.len() == 1 && fp[0] == "{{ default }}")
}

/// The most representative human string on the event, in priority order: the
/// structured log message, then the bare top-level message (what a plain
/// `tracing::error!("…")` populates), then the latest exception value.
fn event_message(event: &Event<'static>) -> Option<String> {
    if let Some(entry) = &event.logentry {
        if !entry.message.is_empty() {
            return Some(entry.message.clone());
        }
    }
    if let Some(msg) = &event.message {
        if !msg.is_empty() {
            return Some(msg.clone());
        }
    }
    event
        .exception
        .values
        .last()
        .and_then(|exc| exc.value.clone())
}

/// `before_send` step: give the event a deterministic fingerprint so a family of
/// near-identical messages collapses into ONE Sentry issue. Leaves events that
/// already set an explicit fingerprint alone, no-ops when there is no usable
/// message to key on, and NEVER drops the event.
pub fn with_stable_fingerprint(mut event: Event<'static>) -> Event<'static> {
    if !is_default_fingerprint(&event.fingerprint) {
        return event;
    }
    if let Some(raw) = event_message(&event) {
        let key = normalize_fingerprint_message(&raw);
        if !key.is_empty() {
            event.fingerprint = Cow::Owned(vec![Cow::Owned(key)]);
        }
    }
    event
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Exception, Level};

    #[test]
    fn collapses_codex_parse_errors_across_columns() {
        // The dominant duplicate family: same parser bug, different serde
        // column, plus the whole raw frame tacked on a second line.
        let a = normalize_fingerprint_message(
            "Failed to parse Codex event: invalid type: null, expected i32 at line 1 column 190\nLine: {\"id\":42,\"x\":1}",
        );
        let b = normalize_fingerprint_message(
            "Failed to parse Codex event: invalid type: null, expected i32 at line 1 column 300\nLine: {\"id\":7}",
        );
        assert_eq!(a, b, "different columns must share one fingerprint");
        // Raw second line is dropped, every number masked.
        assert_eq!(
            a,
            "Failed to parse Codex event: invalid type: null, expected i{n} at line {n} column {n}"
        );
        assert!(!a.contains("Line:"), "raw frame must not reach the key");
    }

    #[test]
    fn distinct_serde_messages_stay_separate() {
        // "expected value" (empty/garbage frame) is a different failure mode
        // than "invalid type: null" and must NOT merge with it.
        let expected_value =
            normalize_fingerprint_message("Failed to parse Codex event: expected value at line 1 column 1");
        let invalid_type = normalize_fingerprint_message(
            "Failed to parse Codex event: invalid type: null, expected i32 at line 1 column 190",
        );
        assert_ne!(expected_value, invalid_type);
        // But two "expected value" hits (which today are 5+ separate issues)
        // collapse into one.
        assert_eq!(
            expected_value,
            normalize_fingerprint_message("Failed to parse Codex event: expected value at line 1 column 1")
        );
    }

    #[test]
    fn masks_port_uuid_and_hex() {
        assert_eq!(
            normalize_fingerprint_message("read_agent_file: Load failed (127.0.0.1:57461)"),
            "read_agent_file: Load failed ({addr})"
        );
        assert_eq!(
            normalize_fingerprint_message("composio login --key cf7f2461-f693-4f65-95bf-6d110f1d4344"),
            "composio login --key {uuid}"
        );
        assert_eq!(
            normalize_fingerprint_message("exited with exit code: 0xc000001d. STATUS_ILLEGAL_INSTRUCTION"),
            "exited with exit code: {hex}. STATUS_ILLEGAL_INSTRUCTION"
        );
    }

    #[test]
    fn caps_key_length() {
        let key = normalize_fingerprint_message(&"x".repeat(500));
        assert_eq!(key.chars().count(), MAX_KEY_LEN);
    }

    fn message_event(msg: &str) -> Event<'static> {
        Event {
            message: Some(msg.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn fingerprints_a_message_event() {
        let event = with_stable_fingerprint(message_event(
            "Failed to parse Codex event: invalid type: null at line 1 column 12",
        ));
        assert_eq!(
            event.fingerprint.as_ref(),
            ["Failed to parse Codex event: invalid type: null at line {n} column {n}"]
        );
    }

    #[test]
    fn reads_exception_value_when_no_message() {
        let mut event = Event::default();
        event.exception.values.push(Exception {
            ty: "error".into(),
            value: Some("io error: Acceso denegado. (os error 5)".into()),
            ..Default::default()
        });
        let event = with_stable_fingerprint(event);
        assert_eq!(
            event.fingerprint.as_ref(),
            ["io error: Acceso denegado. (os error {n})"]
        );
    }

    #[test]
    fn preserves_an_explicit_fingerprint() {
        let mut event = message_event("anything at all 123");
        event.fingerprint = Cow::Owned(vec![Cow::Borrowed("engine-subprocess-exit")]);
        let event = with_stable_fingerprint(event);
        assert_eq!(event.fingerprint.as_ref(), ["engine-subprocess-exit"]);
    }

    #[test]
    fn no_message_keeps_default_grouping() {
        // An event with neither message nor exception keeps Sentry's default
        // fingerprint so we never collapse unrelated empty events into one.
        let event = with_stable_fingerprint(Event {
            level: Level::Error,
            ..Default::default()
        });
        assert!(is_default_fingerprint(&event.fingerprint));
    }
}
