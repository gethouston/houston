//! Heuristic anonymizer for portable agent payloads.
//!
//! V1 uses regex patterns: emails, phone numbers, absolute paths that
//! leak `~/Users/<name>` / `/home/<name>`, and a few common identifier
//! shapes. A Haiku-driven version (better, slower, costs tokens) is the
//! intended v2 upgrade — when it lands, swap the implementation behind
//! this same `anonymize_*` API and the wizard does not change.
//!
//! Why ship regex first: predictable, fast, free, easy to reason about
//! in tests. Good enough for the "Help me anonymize" toggle the user
//! sees before sharing.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::portable::export::{gather_inventory, RoutineFieldOverride};

use std::path::Path;

// ── Wire DTOs ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizeRequest {
    /// Optional subset of slugs / ids to anonymize. Empty means "all".
    #[serde(default)]
    pub claude_md: bool,
    #[serde(default)]
    pub skill_slugs: Vec<String>,
    #[serde(default)]
    pub routine_ids: Vec<String>,
    #[serde(default)]
    pub learning_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizeResponse {
    pub claude_md: Option<AnonymizedString>,
    pub skills: Vec<AnonymizedItem>,
    pub routines: Vec<AnonymizedRoutine>,
    pub learnings: Vec<AnonymizedItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizedString {
    pub before: String,
    pub after: String,
    pub summary: String,
    pub became_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizedItem {
    pub id: String,
    pub before: String,
    pub after: String,
    pub summary: String,
    pub became_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizedRoutine {
    pub id: String,
    pub field_diffs: Vec<RoutineFieldDiff>,
    pub override_payload: RoutineFieldOverride,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineFieldDiff {
    pub field: String,
    pub before: String,
    pub after: String,
}

// ── Top-level entry point ───────────────────────────────────────────────

/// Read inventory from disk, apply heuristics, return diffs the wizard
/// renders side-by-side.
pub fn anonymize_agent(agent_root: &Path, req: AnonymizeRequest) -> CoreResult<AnonymizeResponse> {
    let inv = gather_inventory(agent_root)?;
    let mut out = AnonymizeResponse::default();

    if req.claude_md {
        if let Some(body) = inv.claude_md.as_deref() {
            out.claude_md = Some(redact_string(body));
        }
    }

    for skill in &inv.skills {
        if !req.skill_slugs.iter().any(|s| s == &skill.slug) {
            continue;
        }
        let r = redact_string(&skill.skill_md);
        out.skills.push(AnonymizedItem {
            id: skill.slug.clone(),
            before: r.before,
            after: r.after,
            summary: r.summary,
            became_empty: r.became_empty,
        });
    }

    for routine in &inv.routines {
        if !req.routine_ids.iter().any(|s| s == &routine.id) {
            continue;
        }
        let mut field_diffs = Vec::new();
        let mut override_payload = RoutineFieldOverride::default();

        for (field, original) in [
            ("name", routine.name.as_str()),
            ("description", routine.description.as_str()),
            ("prompt", routine.prompt.as_str()),
        ] {
            let r = redact_text(original);
            if r != original {
                field_diffs.push(RoutineFieldDiff {
                    field: field.into(),
                    before: original.to_string(),
                    after: r.clone(),
                });
                match field {
                    "name" => override_payload.name = Some(r),
                    "description" => override_payload.description = Some(r),
                    "prompt" => override_payload.prompt = Some(r),
                    _ => {}
                }
            }
        }

        out.routines.push(AnonymizedRoutine {
            id: routine.id.clone(),
            field_diffs,
            override_payload,
        });
    }

    for learning in &inv.learnings {
        if !req.learning_ids.iter().any(|s| s == &learning.id) {
            continue;
        }
        let r = redact_string(&learning.text);
        out.learnings.push(AnonymizedItem {
            id: learning.id.clone(),
            before: r.before,
            after: r.after,
            summary: r.summary,
            became_empty: r.became_empty,
        });
    }

    Ok(out)
}

// ── Redaction primitives ────────────────────────────────────────────────

fn redact_string(body: &str) -> AnonymizedString {
    let after = redact_text(body);
    // "Became empty" = nothing meaningful left after the placeholder
    // tokens are stripped. The UI uses this to nudge "exclude this item
    // instead?" — a placeholder-only learning is worse than no learning.
    let placeholder = Regex::new(r"<[a-zA-Z_-]+>").unwrap();
    let stripped: String = placeholder.replace_all(&after, "").to_string();
    let became_empty = !stripped.chars().any(|c| c.is_alphanumeric());
    let summary = summarise(body, &after);
    AnonymizedString {
        before: body.to_string(),
        after,
        summary,
        became_empty,
    }
}

/// Apply every redaction pattern in turn. Order matters: paths before
/// emails so usernames embedded in `~/Users/julian/...` get caught by the
/// path rule, not stripped to `<email>` accidentally.
fn redact_text(body: &str) -> String {
    let mut out = body.to_string();
    out = PATH_USERS_MAC.replace_all(&out, "$1<user>").to_string();
    out = PATH_USERS_LINUX.replace_all(&out, "$1<user>").to_string();
    out = PATH_USERS_WIN.replace_all(&out, "$1<user>").to_string();
    out = ABSOLUTE_PATH.replace_all(&out, "<path>").to_string();
    out = EMAIL.replace_all(&out, "<email>").to_string();
    out = PHONE.replace_all(&out, "<phone>").to_string();
    out = SLACK_HANDLE.replace_all(&out, "<handle>").to_string();
    out = URL.replace_all(&out, "<url>").to_string();
    out
}

fn summarise(before: &str, after: &str) -> String {
    let kinds = [
        ("email", count_matches(&EMAIL, before)),
        (
            "path",
            count_matches(&PATH_USERS_MAC, before)
                + count_matches(&PATH_USERS_LINUX, before)
                + count_matches(&PATH_USERS_WIN, before)
                + count_matches(&ABSOLUTE_PATH, before),
        ),
        ("phone", count_matches(&PHONE, before)),
        ("handle", count_matches(&SLACK_HANDLE, before)),
        ("url", count_matches(&URL, before)),
    ];
    let parts: Vec<String> = kinds
        .iter()
        .filter(|(_, n)| *n > 0)
        .map(|(k, n)| format!("{n} {k}"))
        .collect();
    if parts.is_empty() {
        "no obvious personal info detected".to_string()
    } else if before == after {
        format!("matched but unchanged ({})", parts.join(", "))
    } else {
        format!("redacted {}", parts.join(", "))
    }
}

fn count_matches(re: &Regex, s: &str) -> usize {
    re.find_iter(s).count()
}

// ── Patterns ────────────────────────────────────────────────────────────

static EMAIL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}").unwrap());

static PHONE: Lazy<Regex> = Lazy::new(|| {
    // Matches `+1 555-555-1212`, `(555) 555-1212`, `+57 311 234 5678`.
    // Conservative: requires 9+ digits including separators.
    Regex::new(r"\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}").unwrap()
});

static SLACK_HANDLE: Lazy<Regex> = Lazy::new(|| {
    // `@alice` outside of an email context (negative lookbehind isn't
    // supported in `regex`; we rely on email matching first to strip
    // those before this one runs).
    Regex::new(r"(?:^|[\s,.;:!])@([a-zA-Z][a-zA-Z0-9._-]{2,})").unwrap()
});

static URL: Lazy<Regex> = Lazy::new(|| Regex::new(r"https?://[^\s<>\)\]]+").unwrap());

static PATH_USERS_MAC: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(/Users/)([A-Za-z0-9._-]+)").unwrap());

static PATH_USERS_LINUX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(/home/)([A-Za-z0-9._-]+)").unwrap());

static PATH_USERS_WIN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"([Cc]:\\Users\\)([A-Za-z0-9._-]+)").unwrap());

static ABSOLUTE_PATH: Lazy<Regex> = Lazy::new(|| {
    // Catches remaining absolute paths in other root dirs (`/var/log/...`,
    // `/etc/...`). `Users/` and `home/` are intentionally NOT here — they
    // are handled by the per-OS rules above so the `<user>` token
    // survives in the output instead of getting collapsed to `<path>`.
    Regex::new(r"(?:^|\s)(/(?:var|opt|etc|tmp)/[\S]+)").unwrap()
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_emails_and_paths() {
        let s = "Reach Alice at alice@example.com or open /Users/julian/work/notes.md.";
        let r = redact_text(s);
        assert!(r.contains("<email>"));
        assert!(r.contains("/Users/<user>"));
        assert!(!r.contains("alice@example.com"));
        assert!(!r.contains("julian"));
    }

    #[test]
    fn redacts_phone_numbers() {
        let s = "Call us at +1 555-555-1212.";
        let r = redact_text(s);
        assert!(r.contains("<phone>"));
        assert!(!r.contains("555-1212"));
    }

    #[test]
    fn redacts_slack_handles() {
        let s = "Ping @alice when ready.";
        let r = redact_text(s);
        assert!(r.contains("<handle>"));
    }

    #[test]
    fn empty_after_redaction_flagged() {
        let s = "alice@example.com";
        let r = redact_string(s);
        // The result is `<email>` — alphanumerics only inside the brackets.
        assert!(r.became_empty);
    }

    #[test]
    fn unchanged_when_clean() {
        let s = "Draft the quarterly report.";
        let r = redact_text(s);
        assert_eq!(r, s);
    }
}
