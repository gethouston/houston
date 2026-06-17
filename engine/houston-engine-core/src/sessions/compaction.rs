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

/// Cap on a verbatim provider-switch replay. Far larger than the summarizer cap
/// because the whole point is to carry the FULL conversation across when it
/// fits the new provider's window (the frontend only chooses `Replay` after
/// confirming it fits). `render_visible_entries` already drops tool noise, so
/// this is conversation text, not raw turns; ~3 MB ≈ 750k tokens stays under
/// every catalogued window ceiling. `truncate_history_tail` keeps the most
/// recent text and marks any omission rather than failing.
const REPLAY_MAX_BYTES: usize = 3_000_000;

/// Generous bound — summarizing a long conversation with a capable model takes
/// longer than a title. Still bounded so a hung CLI can't wedge the turn.
const SUMMARY_TIMEOUT: Duration = Duration::from_secs(90);

/// Cheap, always-available fallback summary model per provider, used only when
/// the conversation's own model is unknown. Mirrors `summarize`'s title tiers.
fn fallback_summary_model(provider: Provider) -> Option<&'static str> {
    match provider.id() {
        "anthropic" => Some("haiku"),
        "openai" => Some("gpt-5.5-mini"),
        "openrouter" => Some("deepseek/deepseek-chat"),
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

/// Build the seed for a forced compaction. `Ok(None)` means there is genuinely
/// nothing to summarize (no visible history yet). `Err` means the summarize
/// step failed — either the summarizer call errored, or it returned empty text
/// despite real history existing (an unusable summary). Callers must treat the
/// two differently: a provider switch surfaces the `Err` (the user consented to
/// the summary), while autocompact degrades to a normal resume (the provider's
/// own auto-compaction is the backstop).
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

    let summary_model = model.or_else(|| fallback_summary_model(provider)).ok_or_else(|| {
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
        // History WAS non-empty (checked above), but the summarizer returned
        // nothing usable. That's a real failure, not a "nothing to summarize" —
        // distinct from the `Ok(None)` above so callers can tell them apart. The
        // provider-switch path surfaces this (the user consented to + paid for a
        // summary); autocompact degrades to a normal resume in its `Err` arm.
        return Err(CoreError::Internal(
            "summarizer returned empty output".to_string(),
        ));
    }

    Ok(Some(CompactionSeed {
        prompt: seeded_prompt(summary, latest_user_prompt),
        pre_tokens,
    }))
}

/// Outcome of preparing a verbatim replay: the full rendered transcript framed
/// as the seed prompt for a fresh session on the new provider, plus the context
/// size just before the switch (for the divider marker).
pub struct ReplaySeed {
    pub prompt: String,
    pub pre_tokens: Option<u64>,
}

/// Build a verbatim-replay seed for a provider switch: render the FULL visible
/// transcript and frame it as established context for a fresh session on the
/// new provider. Unlike [`build_compaction_seed`] this makes NO provider call,
/// so it never depends on the leaving provider (the transcript comes from our
/// `chat_feed`) — the reliable path when the user is switching precisely
/// because the old provider hit a wall (out of credits, rate limited).
///
/// Returns `Ok(None)` when there is no visible history to carry. Returns `Err`
/// only on a DB read failure; the caller surfaces that rather than silently
/// starting the new provider blank, because a provider switch was explicit.
pub async fn build_replay_seed(
    db: &Database,
    working_dir: &Path,
    agent_dir: &Path,
    session_key: &str,
    latest_user_prompt: &str,
) -> CoreResult<Option<ReplaySeed>> {
    let mut entries = history::load(db, working_dir, session_key).await?;
    if entries.is_empty() && agent_dir != working_dir {
        entries = history::load(db, agent_dir, session_key).await?;
    }

    let rendered = history::render_visible_entries(&entries).join("\n\n");
    if rendered.trim().is_empty() {
        return Ok(None);
    }
    let pre_tokens = latest_context_tokens(&entries);
    let capped = history::truncate_history_tail(rendered, REPLAY_MAX_BYTES);

    Ok(Some(ReplaySeed {
        prompt: replay_seeded_prompt(&capped, latest_user_prompt),
        pre_tokens,
    }))
}

/// Wrap the verbatim transcript + the user's latest message into the prompt the
/// fresh session receives after a provider switch. The transcript is the
/// ongoing conversation (established context); the latest message is the task.
fn replay_seeded_prompt(history: &str, latest_user_prompt: &str) -> String {
    format!(
        "This conversation continues from earlier work that a different assistant handled. The full prior conversation is below. Treat it as the ongoing conversation you are part of, not a new task or a document to react to.\n\n<conversation_history>\n{history}\n</conversation_history>\n\nLatest user message:\n<latest_user_message>\n{latest_user_prompt}\n</latest_user_message>"
    )
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
    fn replay_prompt_carries_verbatim_history_and_keeps_latest_as_task() {
        let p = replay_seeded_prompt(
            "User:\nrefactor the parser\n\nAssistant:\ndone, split into modules",
            "now add tests",
        );
        assert!(p.contains("<conversation_history>"));
        assert!(p.contains("refactor the parser"));
        assert!(p.contains("split into modules"));
        assert!(p.contains("<latest_user_message>"));
        assert!(p.contains("now add tests"));
        // Verbatim, not summarized: the original assistant text is present.
        assert!(p.contains("done, split into modules"));
        // No em dashes in generated text (project copy rule).
        assert!(!p.contains('\u{2014}'));
    }

    #[tokio::test]
    async fn replay_seed_renders_full_visible_history() {
        let db = houston_db::Database::connect_in_memory().await.unwrap();
        let dir = tempfile::TempDir::new().unwrap();
        let provider: Provider = "anthropic".parse().unwrap();
        let sid_path = houston_agents_conversations::session_id_tracker::session_id_path(
            dir.path(),
            provider,
            "chat",
        );
        std::fs::create_dir_all(sid_path.parent().unwrap()).unwrap();
        std::fs::write(&sid_path, "claude-session").unwrap();
        for (ft, text) in [
            ("user_message", "plan the launch"),
            ("assistant_text", "step one: pick a date"),
        ] {
            db.add_chat_feed_item_by_session(
                "claude-session",
                ft,
                &serde_json::Value::String(text.into()).to_string(),
                "test",
            )
            .await
            .unwrap();
        }

        let seed = build_replay_seed(&db, dir.path(), dir.path(), "chat", "now draft the invite")
            .await
            .unwrap()
            .expect("replay seed");
        assert!(seed.prompt.contains("plan the launch"));
        assert!(seed.prompt.contains("step one: pick a date"));
        assert!(seed.prompt.contains("now draft the invite"));
    }

    #[tokio::test]
    async fn replay_seed_is_none_without_visible_history() {
        let db = houston_db::Database::connect_in_memory().await.unwrap();
        let dir = tempfile::TempDir::new().unwrap();
        let seed = build_replay_seed(&db, dir.path(), dir.path(), "chat", "hi")
            .await
            .unwrap();
        assert!(seed.is_none());
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
