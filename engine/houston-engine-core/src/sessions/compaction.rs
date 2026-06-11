//! Proactive context compaction — the forced "summarize-and-reseed" path.
//!
//! When the frontend sees a conversation's context fill cross the user's
//! threshold, it sets `compact: true` on the next turn (see
//! `StartParams::compact`). The engine then summarizes the visible chat
//! history into a compact handoff, abandons the current provider resume id
//! (kept in `.history` so the chat stays visible), and runs the turn on a
//! FRESH provider session seeded with the summary.
//!
//! The user's `chat_feed` is never mutated — they still see every message;
//! only the agent's working context shrinks. This is provider-agnostic: it
//! works the same for Claude, Codex, and Gemini, and is the reliable path for
//! Codex (whose own auto-compaction is unreliable in `exec` mode).

use super::{history, provider_oneshot};
use crate::error::{CoreError, CoreResult};
use houston_db::Database;
use houston_terminal_manager::Provider;
use std::path::Path;
use std::time::Duration;

/// Cap on how much rendered history we feed the summarizer. Mirrors the
/// resume-recovery cap; keeps the summary call itself from blowing context.
const MAX_HISTORY_BYTES: usize = 120_000;

/// Generous bound — summarizing a long conversation with a capable model takes
/// longer than a title. Still bounded so a hung CLI can't wedge the turn.
const SUMMARY_TIMEOUT: Duration = Duration::from_secs(90);

/// Cheap, always-available fallback summary model per provider, used only when
/// the conversation's own model is unknown. Mirrors `summarize`'s title tiers.
fn fallback_summary_model(provider: Provider) -> Option<&'static str> {
    match provider.id() {
        "anthropic" => Some("haiku"),
        "openai" => Some("gpt-5.5-mini"),
        "gemini" => Some("gemini-3.1-flash-lite"),
        _ => None,
    }
}

/// Outcome of preparing a compaction: the seeded prompt to send to the fresh
/// session, plus the context size just before compaction (for the marker).
pub struct CompactionSeed {
    pub prompt: String,
    pub pre_tokens: Option<u64>,
}

/// Build the seed for a forced compaction, or `Ok(None)` when there is nothing
/// to summarize (no visible history yet). Returns `Err` only when the
/// summarizer call itself fails — the caller degrades to a normal resume in
/// that case (the provider's own auto-compaction is the backstop).
pub async fn build_compaction_seed(
    db: &Database,
    working_dir: &Path,
    agent_dir: &Path,
    session_key: &str,
    latest_user_prompt: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Option<CompactionSeed>> {
    let mut entries = history::load(db, working_dir, session_key).await?;
    if entries.is_empty() && agent_dir != working_dir {
        entries = history::load(db, agent_dir, session_key).await?;
    }

    let rendered = history::render_visible_entries(&entries).join("\n\n");
    if rendered.trim().is_empty() {
        return Ok(None);
    }
    let pre_tokens = latest_context_tokens(&entries);
    let capped = history::truncate_history_tail(rendered, MAX_HISTORY_BYTES);

    let summary_model = model
        .or_else(|| fallback_summary_model(provider))
        .ok_or_else(|| {
            CoreError::Internal(format!(
                "no summary model available for provider {:?}",
                provider.id()
            ))
        })?;

    let summary = provider_oneshot::run_provider_oneshot(
        &summary_request_prompt(&capped),
        provider,
        summary_model,
        SUMMARY_TIMEOUT,
    )
    .await
    .map_err(CoreError::Internal)?;

    let summary = summary.trim();
    if summary.is_empty() {
        return Ok(None);
    }

    Ok(Some(CompactionSeed {
        prompt: seeded_prompt(summary, latest_user_prompt),
        pre_tokens,
    }))
}

/// The prompt sent to the summarizer CLI. Asks for a handoff brief that lets a
/// fresh agent continue the SAME work without the full transcript.
fn summary_request_prompt(history: &str) -> String {
    format!(
        "You are compacting a conversation so a fresh assistant session can continue the SAME work without the full transcript. Write a dense handoff summary that preserves: the user's goal and any constraints, decisions already made, key facts and file paths, what has been done so far, and the immediate next step. Omit small talk. Use compact prose or bullet points. Do not address the user; these are notes for the next assistant.\n\n<conversation>\n{history}\n</conversation>"
    )
}

/// Wrap the summary + the user's actual latest message into the prompt the
/// fresh session receives. The summary is established context; the latest
/// message is the task. Mirrors the resume-recovery framing.
fn seeded_prompt(summary: &str, latest_user_prompt: &str) -> String {
    format!(
        "This conversation continues from earlier work that was summarized to save space. Treat the summary as established context, not as a new task.\n\n<conversation_summary>\n{summary}\n</conversation_summary>\n\nLatest user message:\n<latest_user_message>\n{latest_user_prompt}\n</latest_user_message>"
    )
}

/// Pull the most recent reported context size from the visible history so the
/// compaction marker can show how full things were. Best-effort.
fn latest_context_tokens(entries: &[history::ChatHistoryEntry]) -> Option<u64> {
    entries
        .iter()
        .rev()
        .find(|e| e.feed_type == "final_result")
        .and_then(|e| e.data.get("usage"))
        .and_then(|u| u.get("context_tokens"))
        .and_then(serde_json::Value::as_u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(feed_type: &str, data: serde_json::Value) -> history::ChatHistoryEntry {
        history::ChatHistoryEntry {
            feed_type: feed_type.to_string(),
            data,
        }
    }

    #[test]
    fn summary_prompt_wraps_history_and_states_intent() {
        let p = summary_request_prompt("User: do X\n\nAssistant: did Y");
        assert!(p.contains("<conversation>"));
        assert!(p.contains("do X"));
        assert!(p.contains("did Y"));
        assert!(p.contains("handoff summary"));
        // No em dashes in any generated text (project copy rule, even for
        // model-facing prompts we keep it clean).
        assert!(!p.contains('\u{2014}'));
    }

    #[test]
    fn seeded_prompt_keeps_summary_as_context_and_latest_as_task() {
        let p = seeded_prompt("Goal: ship feature", "now write the tests");
        assert!(p.contains("<conversation_summary>"));
        assert!(p.contains("Goal: ship feature"));
        assert!(p.contains("<latest_user_message>"));
        assert!(p.contains("now write the tests"));
        // The original user message must be present verbatim so the fresh
        // session answers the real ask, not the summary.
        assert!(p.contains("now write the tests"));
    }

    #[test]
    fn latest_context_tokens_reads_most_recent_final_result_usage() {
        let entries = vec![
            entry("user_message", json!("hi")),
            entry(
                "final_result",
                json!({ "result": "a", "usage": { "context_tokens": 1000 } }),
            ),
            entry("assistant_text", json!("ok")),
            entry(
                "final_result",
                json!({ "result": "b", "usage": { "context_tokens": 185000 } }),
            ),
        ];
        assert_eq!(latest_context_tokens(&entries), Some(185_000));
    }

    #[test]
    fn latest_context_tokens_none_when_usage_missing_or_null() {
        let entries = vec![
            entry("user_message", json!("hi")),
            entry("final_result", json!({ "result": "a", "usage": null })),
        ];
        assert_eq!(latest_context_tokens(&entries), None);

        let no_final = vec![entry("user_message", json!("hi"))];
        assert_eq!(latest_context_tokens(&no_final), None);
    }

    #[test]
    fn fallback_summary_model_is_wired_per_provider() {
        assert_eq!(
            fallback_summary_model("anthropic".parse().unwrap()),
            Some("haiku")
        );
        assert_eq!(
            fallback_summary_model("openai".parse().unwrap()),
            Some("gpt-5.5-mini")
        );
        assert_eq!(
            fallback_summary_model("gemini".parse().unwrap()),
            Some("gemini-3.1-flash-lite")
        );
    }
}
