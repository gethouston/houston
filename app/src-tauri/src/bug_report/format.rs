use super::BugReportPayload;

const MAX_ERROR_CHARS: usize = 6_000;
const MAX_LOG_CHARS: usize = 8_000;

/// Which sink an issue body is destined for.
///
/// `Internal` (Linear) gets the full payload. `PublicMirror` (the public
/// GitHub repo) drops the user-identifying context line and omits the log
/// blocks entirely: logs routinely embed emails and OS home paths, so a
/// public mirror must never carry them.
#[derive(Clone, Copy)]
pub(super) enum Audience {
    Internal,
    PublicMirror,
}

pub(super) fn format_issue_title(payload: &BugReportPayload) -> String {
    let command = collapse_whitespace(&payload.command);
    let summary = collapse_whitespace(payload.error.lines().next().unwrap_or(""));
    if summary.is_empty() {
        truncate_chars(&format!("Houston bug: {command}"), 140)
    } else {
        truncate_chars(&format!("Houston bug: {command} - {summary}"), 140)
    }
}

pub(super) fn format_issue_description(payload: &BugReportPayload, audience: Audience) -> String {
    let mut description = String::new();
    description.push_str("## Error\n\n");
    description.push_str(&markdown_code_block(
        "text",
        &truncate_start(&payload.error, MAX_ERROR_CHARS),
    ));
    description.push_str("\n## Context\n\n");
    push_context_line(&mut description, "Command", Some(&payload.command));
    push_context_line(&mut description, "Timestamp", Some(&payload.timestamp));
    push_context_line(&mut description, "App Version", Some(&payload.app_version));
    if matches!(audience, Audience::Internal) {
        push_context_line(
            &mut description,
            "User",
            payload
                .user_email
                .as_deref()
                .filter(|value| !value.is_empty()),
        );
    }
    push_context_line(
        &mut description,
        "Space",
        payload
            .space_name
            .as_deref()
            .filter(|value| !value.is_empty()),
    );
    push_context_line(
        &mut description,
        "Workspace",
        payload
            .workspace_name
            .as_deref()
            .filter(|value| !value.is_empty()),
    );
    if matches!(audience, Audience::Internal) {
        description.push_str("\n## Backend Logs (last 50 lines)\n\n");
        description.push_str(&markdown_code_block(
            "text",
            &truncate_start(&payload.logs.backend, MAX_LOG_CHARS),
        ));
        description.push_str("\n## Frontend Logs (last 50 lines)\n\n");
        description.push_str(&markdown_code_block(
            "text",
            &truncate_start(&payload.logs.frontend, MAX_LOG_CHARS),
        ));
    }
    description
}

pub(super) fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let keep = max_chars.saturating_sub(3);
    let mut truncated: String = value.chars().take(keep).collect();
    truncated.push_str("...");
    truncated
}

fn push_context_line(description: &mut String, label: &str, value: Option<&str>) {
    if let Some(value) = value {
        description.push_str("- ");
        description.push_str(label);
        description.push_str(": ");
        description.push_str(value);
        description.push('\n');
    }
}

fn markdown_code_block(language: &str, content: &str) -> String {
    let fence_len = max_backtick_run(content).saturating_add(1).max(3);
    let fence = "`".repeat(fence_len);
    format!("{fence}{language}\n{content}\n{fence}\n")
}

fn max_backtick_run(content: &str) -> usize {
    content
        .split(|ch| ch != '`')
        .map(str::len)
        .max()
        .unwrap_or(0)
}

fn truncate_start(value: &str, max_chars: usize) -> String {
    let len = value.chars().count();
    if len <= max_chars {
        return value.to_string();
    }
    let keep = max_chars.saturating_sub(4);
    let tail: String = value.chars().skip(len - keep).collect();
    format!("...\n{tail}")
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bug_report::sample_payload;

    #[test]
    fn issue_title_includes_command_and_error_summary() {
        let payload = sample_payload();
        assert_eq!(
            format_issue_title(&payload),
            "Houston bug: list_workspaces - Error: no workspace found"
        );
    }

    #[test]
    fn internal_description_includes_context_and_logs() {
        let payload = sample_payload();
        let description = format_issue_description(&payload, Audience::Internal);
        assert!(description.contains("## Error"));
        assert!(description.contains("Error: no workspace found"));
        assert!(description.contains("- Command: list_workspaces"));
        assert!(description.contains("- User: user@example.com"));
        assert!(description.contains("backend log line"));
        assert!(description.contains("frontend log line"));
    }

    #[test]
    fn public_mirror_description_omits_user_and_logs() {
        let payload = sample_payload();
        let description = format_issue_description(&payload, Audience::PublicMirror);
        // Still useful for triage.
        assert!(description.contains("## Error"));
        assert!(description.contains("Error: no workspace found"));
        assert!(description.contains("- Command: list_workspaces"));
        assert!(description.contains("- Workspace: Houston"));
        // Sanitized: no identifying user line, no logs (logs leak email + paths).
        assert!(!description.contains("- User:"));
        assert!(!description.contains("user@example.com"));
        assert!(!description.contains("Backend Logs"));
        assert!(!description.contains("Frontend Logs"));
        assert!(!description.contains("backend log line"));
        assert!(!description.contains("frontend log line"));
    }

    #[test]
    fn markdown_code_block_expands_fence_for_backticks() {
        let block = markdown_code_block("text", "before ``` after");
        assert!(block.starts_with("````text\n"));
        assert!(block.ends_with("\n````\n"));
    }

    #[test]
    fn truncate_chars_returns_input_at_or_below_limit() {
        assert_eq!(truncate_chars("hello", 10), "hello");
        assert_eq!(truncate_chars("hello", 5), "hello"); // exact boundary
    }

    #[test]
    fn truncate_chars_appends_ellipsis_when_over_limit() {
        // keep = max - 3 → "hello" + "..."
        assert_eq!(truncate_chars("hello world", 8), "hello...");
    }

    #[test]
    fn truncate_chars_is_multibyte_safe() {
        // 6 crab emoji (each is a single char, 4 bytes). A naive byte
        // slice at index 4 would panic mid-codepoint.
        let input = "🦀🦀🦀🦀🦀🦀";
        let result = truncate_chars(input, 4);
        assert_eq!(result, "🦀..."); // 1 kept + 3 dots = 4 chars
    }

    #[test]
    fn truncate_start_returns_input_at_or_below_limit() {
        assert_eq!(truncate_start("hello", 10), "hello");
        assert_eq!(truncate_start("hello", 5), "hello"); // exact boundary
    }

    #[test]
    fn truncate_start_keeps_tail_with_marker_when_over_limit() {
        // keep = 6 - 4 = 2 → last 2 chars "89", prefixed with "...\n"
        assert_eq!(truncate_start("0123456789", 6), "...\n89");
    }

    #[test]
    fn truncate_start_is_multibyte_safe() {
        // keep = 5 - 4 = 1 → last crab. Byte-slicing would panic.
        let input = "🦀🦀🦀🦀🦀🦀";
        assert_eq!(truncate_start(input, 5), "...\n🦀");
    }
}
