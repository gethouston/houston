use super::BugReportPayload;

const MAX_ERROR_CHARS: usize = 6_000;
const MAX_LOG_CHARS: usize = 8_000;

pub(super) fn format_issue_title(payload: &BugReportPayload) -> String {
    // When the user wrote their own feedback, lead the title with that — it's
    // the part the engineer's eye lands on in the Linear queue.
    if let Some(message) = payload
        .user_message
        .as_deref()
        .map(collapse_whitespace)
        .filter(|s| !s.is_empty())
    {
        return truncate_chars(&format!("Houston feedback: {message}"), 140);
    }

    let command = collapse_whitespace(&payload.command);
    let summary = collapse_whitespace(payload.error.lines().next().unwrap_or(""));
    if summary.is_empty() {
        truncate_chars(&format!("Houston bug: {command}"), 140)
    } else {
        truncate_chars(&format!("Houston bug: {command} - {summary}"), 140)
    }
}

pub(super) fn format_issue_description(payload: &BugReportPayload) -> String {
    let mut description = String::new();

    // User's own words first, when present — these came from the "Send
    // feedback" menu (voluntary submission), so the engineer should read
    // them before machine-generated context.
    if let Some(message) = payload
        .user_message
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        description.push_str("## What the user said\n\n");
        description.push_str(message);
        description.push_str("\n\n");
    }

    description.push_str("## Error\n\n");
    description.push_str(&markdown_code_block(
        "text",
        &truncate_start(&payload.error, MAX_ERROR_CHARS),
    ));
    description.push_str("\n## Context\n\n");
    push_context_line(&mut description, "Command", Some(&payload.command));
    push_context_line(&mut description, "Timestamp", Some(&payload.timestamp));
    push_context_line(&mut description, "App Version", Some(&payload.app_version));
    push_context_line(
        &mut description,
        "User",
        payload
            .user_email
            .as_deref()
            .filter(|value| !value.is_empty()),
    );
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
    fn issue_description_includes_context_and_logs() {
        let payload = sample_payload();
        let description = format_issue_description(&payload);
        assert!(description.contains("## Error"));
        assert!(description.contains("Error: no workspace found"));
        assert!(description.contains("- Command: list_workspaces"));
        assert!(description.contains("- User: user@example.com"));
        assert!(description.contains("backend log line"));
        assert!(description.contains("frontend log line"));
    }

    #[test]
    fn markdown_code_block_expands_fence_for_backticks() {
        let block = markdown_code_block("text", "before ``` after");
        assert!(block.starts_with("````text\n"));
        assert!(block.ends_with("\n````\n"));
    }

    #[test]
    fn user_message_leads_title_when_present() {
        let mut payload = sample_payload();
        payload.user_message = Some("The chat froze when I asked about taxes".to_string());
        let title = format_issue_title(&payload);
        assert_eq!(
            title,
            "Houston feedback: The chat froze when I asked about taxes"
        );
    }

    #[test]
    fn user_message_appears_in_description_before_error() {
        let mut payload = sample_payload();
        payload.user_message = Some("Hey it doesn't open".to_string());
        let description = format_issue_description(&payload);
        let user_idx = description
            .find("Hey it doesn't open")
            .expect("user message present");
        let error_idx = description.find("## Error").expect("error section present");
        assert!(
            user_idx < error_idx,
            "user message should appear before error section"
        );
    }

    #[test]
    fn empty_user_message_falls_through_to_command_title() {
        let mut payload = sample_payload();
        payload.user_message = Some("   ".to_string());
        let title = format_issue_title(&payload);
        // Whitespace-only message is treated as absent; we use the
        // command + error summary path instead.
        assert!(title.starts_with("Houston bug:"));
    }
}
