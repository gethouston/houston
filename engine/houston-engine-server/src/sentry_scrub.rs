//! Defense-in-depth secret scrubbing for outbound Sentry events (HOU-431).
//!
//! The primary fix for the composio `--key` credential leak is redaction at
//! the source: `houston_composio::cli` no longer formats the raw key into any
//! log line or error string. This `before_send` hook is the safety net — if
//! any *future* code path ever formats a `--key <value>` secret into a
//! `tracing::error!`, a breadcrumb, or an exception value, this strips it
//! before the event leaves the process.
//!
//! Scope is deliberately narrow: it only touches the `--key <value>` shape, so
//! legitimate UUIDs (agent ids, workspace ids) that are useful for triage are
//! never redacted.

use sentry::protocol::{Event, Value};

const REDACTED: &str = "<redacted>";

/// Tokens that introduce a composio login-session secret. The same value
/// surfaces three ways: the `--key` argv flag, the `cliKey` query param
/// embedded in `login_url`, and the `cli_key` JSON field of the CLI's
/// start-login output (HOU-431).
const SECRET_MARKERS: [&str; 3] = ["--key", "cliKey", "cli_key"];

/// Redact the value that follows any [`SECRET_MARKERS`] token in `input`.
///
/// Handles every shape the secret takes inside a captured string:
///   - shell:        `--key cf7f2461-...`
///   - joined:       `--key=cf7f2461-...`
///   - Rust `{:?}`:  `"--key", "cf7f2461-..."`
///   - URL param:    `?cliKey=cf7f2461-...`
///   - JSON field:   `"cli_key":"cf7f2461-..."`
///
/// Anything not following a marker passes through untouched. UTF-8 safe:
/// only ever slices on `char_indices` boundaries.
pub fn scrub_key_secrets(input: &str) -> String {
    if !SECRET_MARKERS.iter().any(|m| input.contains(m)) {
        return input.to_string();
    }

    // Separators between a marker and its value: quote / comma / `=` / `:` /
    // whitespace — covers `--key `, `--key=`, the Debug form `"--key", "`,
    // the URL `cliKey=`, and the JSON `"cli_key":"`.
    let is_sep = |c: char| matches!(c, '"' | '\'' | ',' | '=' | ':') || c.is_whitespace();
    // The value ends at the first quote / comma / bracket / brace / ampersand
    // (argv-Debug, JSON, and URL-query delimiters) or whitespace.
    let is_boundary = |c: char| matches!(c, '"' | '\'' | ',' | ']' | '}' | '&') || c.is_whitespace();

    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    loop {
        // Earliest marker remaining in `rest`.
        let Some((pos, marker)) = SECRET_MARKERS
            .iter()
            .filter_map(|m| rest.find(m).map(|p| (p, *m)))
            .min_by_key(|&(p, _)| p)
        else {
            break;
        };
        out.push_str(&rest[..pos]);
        out.push_str(marker);
        rest = &rest[pos + marker.len()..];

        // Copy the separators between the marker and its value verbatim.
        let sep_end = rest
            .char_indices()
            .find(|&(_, c)| !is_sep(c))
            .map(|(idx, _)| idx)
            .unwrap_or(rest.len());
        out.push_str(&rest[..sep_end]);
        rest = &rest[sep_end..];

        // Replace the value run with a single placeholder.
        let val_end = rest
            .char_indices()
            .find(|&(_, c)| is_boundary(c))
            .map(|(idx, _)| idx)
            .unwrap_or(rest.len());
        if val_end > 0 {
            out.push_str(REDACTED);
            rest = &rest[val_end..];
        }
    }
    out.push_str(rest);
    out
}

/// Sentry `before_send` hook: scrub every string-bearing field of an event so
/// a `--key` secret can never leave the process, regardless of which field
/// `sentry-tracing` happened to populate. Never drops events.
pub fn scrub_event(mut event: Event<'static>) -> Option<Event<'static>> {
    if let Some(msg) = event.message.take() {
        event.message = Some(scrub_key_secrets(&msg));
    }
    if let Some(mut entry) = event.logentry.take() {
        entry.message = scrub_key_secrets(&entry.message);
        event.logentry = Some(entry);
    }
    for exc in &mut event.exception.values {
        if let Some(v) = exc.value.take() {
            exc.value = Some(scrub_key_secrets(&v));
        }
    }
    for bc in &mut event.breadcrumbs.values {
        if let Some(m) = bc.message.take() {
            bc.message = Some(scrub_key_secrets(&m));
        }
    }
    for v in event.extra.values_mut() {
        if let Value::String(s) = v {
            *s = scrub_key_secrets(s);
        }
    }
    Some(event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Breadcrumb, Event};

    #[test]
    fn scrubs_debug_formatted_args() {
        let input = r#"composio CLI timed out after 330s: args=["login", "--key", "cf7f2461-f693-4f65-95bf-6d110f1d4344", "--no-skill-install", "-y"]"#;
        let out = scrub_key_secrets(input);
        assert!(!out.contains("cf7f2461"), "secret leaked: {out}");
        assert!(out.contains("--key"));
        assert!(out.contains("<redacted>"));
        // Surrounding non-secret args survive.
        assert!(out.contains("--no-skill-install"));
        assert!(out.contains("\"-y\""));
    }

    #[test]
    fn scrubs_shell_form() {
        assert_eq!(
            scrub_key_secrets("composio login --key abc-123 --no-skill-install"),
            "composio login --key <redacted> --no-skill-install"
        );
    }

    #[test]
    fn scrubs_joined_form() {
        assert_eq!(scrub_key_secrets("--key=secret-uuid"), "--key=<redacted>");
    }

    #[test]
    fn scrubs_url_query_clikey() {
        // `login_url` embeds the secret as `?cliKey=<cli_key>` (HOU-431).
        let input =
            "url=https://dashboard.composio.dev/?cliKey=6490d0eb-66c6-4a50-ae7f-28b3ac147ef9";
        let out = scrub_key_secrets(input);
        assert!(!out.contains("6490d0eb"), "secret leaked: {out}");
        assert!(out.contains("cliKey=<redacted>"), "got: {out}");
        assert!(out.contains("https://dashboard.composio.dev/"));
    }

    #[test]
    fn scrubs_json_cli_key_field() {
        // The CLI's start-login stdout carries the secret twice: in the
        // `login_url` query and in the `cli_key` field. Both must go.
        let input = r#"{"login_url":"https://x/?cliKey=abc-123","cli_key":"abc-123"}"#;
        let out = scrub_key_secrets(input);
        assert!(!out.contains("abc-123"), "secret leaked: {out}");
        assert!(out.contains("cliKey=<redacted>"), "got: {out}");
        assert!(out.contains(r#""cli_key":"<redacted>""#), "got: {out}");
    }

    #[test]
    fn leaves_unrelated_uuids_untouched() {
        let s = "agent 7f3a-2b1c started in workspace pr_99abc";
        assert_eq!(scrub_key_secrets(s), s);
    }

    #[test]
    fn noop_without_key_flag() {
        let s = "nothing to redact here";
        assert_eq!(scrub_key_secrets(s), s);
    }

    #[test]
    fn scrubs_event_message_and_breadcrumb() {
        let mut event = Event {
            message: Some(r#"args=["--key", "leaked-key-123"]"#.to_string()),
            ..Default::default()
        };
        event.breadcrumbs.values.push(Breadcrumb {
            message: Some("login --key leaked-key-456 done".to_string()),
            ..Default::default()
        });

        let out = scrub_event(event).expect("event is never dropped");
        assert!(!out.message.as_ref().unwrap().contains("leaked-key-123"));
        assert!(!out.breadcrumbs.values[0]
            .message
            .as_ref()
            .unwrap()
            .contains("leaked-key-456"));
    }
}
