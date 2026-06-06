use super::types::{FeedItem, ToolRuntimeErrorKind};
use crate::auth_error::{is_auth_retry_noise, AUTH_RETRY_MARKER};

#[derive(Default)]
pub(crate) struct StderrState {
    sent_auth_checking: bool,
    sent_tool_runtime: bool,
}

pub(crate) fn stderr_feed_item(line: &str, state: &mut StderrState) -> Option<FeedItem> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_auth_retry_noise(trimmed) {
        if state.sent_auth_checking {
            return None;
        }
        state.sent_auth_checking = true;
        return Some(FeedItem::SystemMessage(AUTH_RETRY_MARKER.to_string()));
    }
    if is_composio_noise(trimmed) {
        return None;
    }
    if is_tool_runtime_stderr(trimmed) {
        if state.sent_tool_runtime {
            return None;
        }
        state.sent_tool_runtime = true;
        return Some(FeedItem::ToolRuntimeError {
            kind: ToolRuntimeErrorKind::LocalTool,
            details: trimmed.to_string(),
        });
    }
    None
}

/// Composio prints upgrade banners and PowerShell wraps native stderr as
/// `NativeCommandError` even on success. Neither is actionable.
pub(crate) fn is_composio_noise(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }
    lower.contains("nativecommanderror")
        || (lower.contains("update available") && lower.contains("composio"))
        || lower.contains("composio upgrade")
}

pub(crate) fn is_tool_runtime_stderr(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    (lower.contains("codex_core::tools::router") && lower.contains("exec_command failed"))
        || lower.contains("failed to create unified exec process")
        || (lower.contains("createprocess")
            && lower.contains("no such file or directory")
            && lower.contains("exec_command"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_codex_exec_stderr_to_tool_runtime_error() {
        let line = "ERROR codex_core::tools::router: error=exec_command failed for `/bin/zsh -lc 'rg --files'`: CreateProcess { message: \"Rejected(\\\"Failed to create unified exec process: No such file or directory (os error 2)\\\")\" }";
        let mut state = StderrState::default();

        let item = stderr_feed_item(line, &mut state);

        assert!(matches!(
            item,
            Some(FeedItem::ToolRuntimeError {
                kind: ToolRuntimeErrorKind::LocalTool,
                ..
            })
        ));
    }

    #[test]
    fn suppresses_non_actionable_stderr() {
        let mut state = StderrState::default();

        assert!(stderr_feed_item("Reading prompt from stdin...", &mut state).is_none());
        assert!(stderr_feed_item("Downloading model metadata", &mut state).is_none());
        assert!(stderr_feed_item("warning: harmless provider detail", &mut state).is_none());
    }

    #[test]
    fn suppresses_composio_upgrade_stderr() {
        let mut state = StderrState::default();
        assert!(stderr_feed_item(
            "Update available: 0.2.23 → 0.2.30. Run composio upgrade to update",
            &mut state,
        )
        .is_none());
        assert!(stderr_feed_item(
            "+ FullyQualifiedErrorId : NativeCommandError",
            &mut state,
        )
        .is_none());
    }

    #[test]
    fn emits_only_one_tool_runtime_error_per_stderr_stream() {
        let mut state = StderrState::default();
        let first = "exec_command failed: Failed to create unified exec process";
        let second = "exec_command failed: Failed to create unified exec process again";

        assert!(stderr_feed_item(first, &mut state).is_some());
        assert!(stderr_feed_item(second, &mut state).is_none());
    }
}
