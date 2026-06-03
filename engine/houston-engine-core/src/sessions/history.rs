//! Chat history read — relocated from `app/src-tauri/src/commands/chat.rs`.
//!
//! Given an agent path + session key, resolves every known provider resume ID
//! for that key and loads the associated chat-feed rows from the engine DB.
//! Transport-neutral: REST handlers and tests call it the same way.

use crate::error::{CoreError, CoreResult};
use houston_agents_conversations::session_id_tracker::session_ids_for_history;
use houston_db::Database;
use serde::Serialize;
use std::path::Path;

const MAX_RECOVERY_HISTORY_BYTES: usize = 120_000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ChatHistoryEntry {
    pub feed_type: String,
    pub data: serde_json::Value,
}

pub async fn load(
    db: &Database,
    working_dir: &Path,
    session_key: &str,
) -> CoreResult<Vec<ChatHistoryEntry>> {
    let session_ids = session_ids_for_history(working_dir, session_key);
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut rows = Vec::new();
    for session_id in session_ids {
        rows.extend(
            db.list_chat_feed_by_session(&session_id)
                .await
                .map_err(|e| CoreError::Internal(e.to_string()))?,
        );
    }

    rows.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    Ok(rows
        .into_iter()
        .map(|row| {
            let data = serde_json::from_str::<serde_json::Value>(&row.data_json)
                .unwrap_or(serde_json::Value::String(row.data_json));
            ChatHistoryEntry {
                feed_type: row.feed_type,
                data,
            }
        })
        .collect())
}

pub async fn resume_recovery_prompt(
    db: &Database,
    primary_dir: &Path,
    fallback_dir: Option<&Path>,
    session_key: &str,
    latest_user_prompt: &str,
    activity_hint: Option<&str>,
) -> CoreResult<Option<String>> {
    let mut entries = load(db, primary_dir, session_key).await?;
    if entries.is_empty() {
        if let Some(fallback_dir) = fallback_dir.filter(|dir| *dir != primary_dir) {
            entries = load(db, fallback_dir, session_key).await?;
        }
    }

    Ok(build_resume_recovery_prompt(
        &entries,
        latest_user_prompt,
        activity_hint,
    ))
}

pub(crate) fn build_resume_recovery_prompt(
    entries: &[ChatHistoryEntry],
    latest_user_prompt: &str,
    activity_hint: Option<&str>,
) -> Option<String> {
    let mut rendered_entries: Vec<String> = render_visible_entries(entries);

    if rendered_entries.is_empty() {
        if let Some(hint) = activity_hint
            .map(str::trim)
            .filter(|hint| !hint.is_empty() && *hint != latest_user_prompt.trim())
        {
            rendered_entries.push(format!("User:\n{hint}"));
        }
    }

    if rendered_entries.is_empty() {
        return None;
    }

    let recovered_history =
        truncate_history_tail(rendered_entries.join("\n\n"), MAX_RECOVERY_HISTORY_BYTES);
    Some(format!(
        "The previous provider transcript could not be resumed. Continue this conversation using the recovered visible chat history below. Do not treat this as a new conversation.\n\n<recovered_chat_history>\n{recovered_history}\n</recovered_chat_history>\n\nLatest user message:\n<latest_user_message>\n{latest_user_prompt}\n</latest_user_message>"
    ))
}

/// Render the user/assistant turns of a conversation to plain text lines,
/// dropping tool calls/results and other non-conversational feed items. Shared
/// by resume-recovery and proactive compaction so both reconstruct the visible
/// chat the same way.
pub(crate) fn render_visible_entries(entries: &[ChatHistoryEntry]) -> Vec<String> {
    entries.iter().filter_map(render_recovery_entry).collect()
}

fn render_recovery_entry(entry: &ChatHistoryEntry) -> Option<String> {
    let role = match entry.feed_type.as_str() {
        "user_message" => "User",
        "assistant_text" => "Assistant",
        _ => return None,
    };
    let text = text_from_json(&entry.data)?;
    Some(format!("{role}:\n{text}"))
}

fn text_from_json(value: &serde_json::Value) -> Option<String> {
    let text = match value {
        serde_json::Value::String(text) => text.clone(),
        _ => return None,
    };
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Keep the most-recent `max_bytes` of a rendered history, prefixing a note
/// when earlier content was dropped. Splits on a UTF-8 char boundary. Shared
/// by resume-recovery and compaction (each passes its own cap).
pub(crate) fn truncate_history_tail(history: String, max_bytes: usize) -> String {
    if history.len() <= max_bytes {
        return history;
    }

    let mut start = history.len() - max_bytes;
    while !history.is_char_boundary(start) {
        start += 1;
    }
    format!(
        "[Earlier history omitted because it was too long.]\n\n{}",
        &history[start..]
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_agents_conversations::session_id_tracker::session_id_path;
    use houston_db::Database;
    use houston_terminal_manager::Provider;
    use std::fs;
    use tempfile::TempDir;

    fn entry(feed_type: &str, text: &str) -> ChatHistoryEntry {
        ChatHistoryEntry {
            feed_type: feed_type.to_string(),
            data: serde_json::Value::String(text.to_string()),
        }
    }

    #[test]
    fn builds_prompt_from_visible_chat_history() {
        let prompt = build_resume_recovery_prompt(
            &[
                entry("user_message", "ping?"),
                entry("assistant_text", "pong"),
                entry("tool_call", "ignored"),
            ],
            "did you finish?",
            None,
        )
        .expect("recovery prompt");

        assert!(prompt.contains("User:\nping?"));
        assert!(prompt.contains("Assistant:\npong"));
        assert!(prompt.contains("Latest user message:"));
        assert!(prompt.contains("did you finish?"));
        assert!(!prompt.contains("ignored"));
    }

    #[test]
    fn uses_activity_hint_when_no_db_history_exists() {
        let prompt =
            build_resume_recovery_prompt(&[], "did you finish?", Some("ping?")).expect("prompt");

        assert!(prompt.contains("User:\nping?"));
        assert!(prompt.contains("did you finish?"));
    }

    #[test]
    fn skips_recovery_prompt_when_only_hint_duplicates_latest_message() {
        let prompt = build_resume_recovery_prompt(&[], "ping?", Some("ping?"));

        assert!(prompt.is_none());
    }

    #[tokio::test]
    async fn recovery_prompt_loads_history_from_fallback_dir() {
        let db = Database::connect_in_memory().await.unwrap();
        let primary = TempDir::new().unwrap();
        let fallback = TempDir::new().unwrap();
        let provider: Provider = "anthropic".parse().unwrap();
        let sid_path = session_id_path(fallback.path(), provider, "activity-1");
        fs::create_dir_all(sid_path.parent().unwrap()).unwrap();
        fs::write(&sid_path, "old-provider-session").unwrap();
        db.add_chat_feed_item_by_session(
            "old-provider-session",
            "user_message",
            &serde_json::Value::String("ping?".into()).to_string(),
            "test",
        )
        .await
        .unwrap();

        let prompt = resume_recovery_prompt(
            &db,
            primary.path(),
            Some(fallback.path()),
            "activity-1",
            "did you finish?",
            None,
        )
        .await
        .unwrap()
        .expect("recovery prompt");

        assert!(prompt.contains("User:\nping?"));
        assert!(prompt.contains("did you finish?"));
    }
}
