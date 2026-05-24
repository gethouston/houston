//! Bridge between the NDJSON parser and the in-engine MCP handler for the
//! Houston `AskUserQuestion` tool.
//!
//! When an agent (Claude) calls `mcp__houston__AskUserQuestion`, two events
//! happen near-simultaneously inside the engine process:
//!
//! 1. The NDJSON parser in `houston-terminal-manager` sees the `tool_use`
//!    block on Claude's stdout and learns the `tool_use_id`.
//! 2. The Claude CLI subprocess opens an HTTP connection to the in-engine
//!    MCP server at `/v1/mcp/{session_key}/...` and calls the tool with its
//!    arguments. The MCP server sees the arguments but NOT the `tool_use_id`.
//!
//! Neither component on its own can complete the round-trip:
//!
//! - The parser knows the id but can't block Claude waiting for an answer.
//! - The MCP handler can block, but doesn't know which `tool_use_id` it's
//!   blocking on — meaning the REST `/user_input` POST has nothing to key
//!   the answer on.
//!
//! This module is the shared rendezvous. The parser pushes
//! [`parser_saw_tool_use`] every time it sees an `AskUserQuestion` tool_use;
//! the MCP handler calls [`mcp_invoked`] to claim the next pending id (or
//! waits briefly if it arrived first); the MCP handler then calls
//! [`mcp_await_answer`] to block on the user's reply; the REST POST handler
//! calls [`submit_answer`] to fulfill the wait.
//!
//! All orderings are tolerated. Cancellation propagates through dropped
//! oneshot senders.
//!
//! See the plan in `~/.claude/plans/yeah-lets-plan-this-floating-map.md`.

use crate::{CoreError, CoreResult};
use houston_terminal_manager::FeedItem;
use houston_ui_events::{DynEventSink, EventSink, HoustonEvent};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};

/// The MCP tool name the parser watches for. Must match what the in-engine
/// MCP server registers — see `routes/mcp.rs`. Claude addresses it as
/// `mcp__houston__AskUserQuestion` (`mcp__<server>__<tool>` convention).
pub const ASK_USER_TOOL_NAME: &str = "mcp__houston__AskUserQuestion";

/// Shared in-engine state. Cheap to clone — backed by an `Arc<Mutex<...>>`.
#[derive(Default, Clone)]
pub struct PendingAskUserRegistry {
    inner: Arc<Mutex<PendingState>>,
}

#[derive(Default)]
struct PendingState {
    /// Per-session FIFO of `tool_use_id`s the parser has emitted but no MCP
    /// handler has claimed yet (parser-first ordering).
    parser_queue: HashMap<String, VecDeque<String>>,
    /// Per-session FIFO of MCP handlers that arrived before the parser
    /// emitted an id (mcp-first ordering).
    mcp_waiters: HashMap<String, VecDeque<oneshot::Sender<String>>>,
    /// `(session_key, tool_use_id)` → sender that will deliver the user's
    /// answer to the awaiting MCP handler.
    awaiting: HashMap<(String, String), oneshot::Sender<Value>>,
}

impl PendingAskUserRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Called by the NDJSON parser when an `mcp__houston__AskUserQuestion`
    /// `tool_use` block is seen. If an MCP handler is already waiting for an
    /// id on this session, hands it over immediately; otherwise queues the
    /// id for the next [`mcp_invoked`] on the same session.
    pub async fn parser_saw_tool_use(&self, session_key: &str, tool_use_id: String) {
        let mut state = self.inner.lock().await;
        if let Some(waiters) = state.mcp_waiters.get_mut(session_key) {
            // Drain any cancelled waiters; deliver to the first live one.
            while let Some(tx) = waiters.pop_front() {
                if tx.send(tool_use_id.clone()).is_ok() {
                    if waiters.is_empty() {
                        state.mcp_waiters.remove(session_key);
                    }
                    return;
                }
            }
            state.mcp_waiters.remove(session_key);
        }
        state
            .parser_queue
            .entry(session_key.to_string())
            .or_default()
            .push_back(tool_use_id);
    }

    /// Called by the MCP HTTP handler the moment Claude invokes the tool.
    /// Resolves with the matching `tool_use_id` either immediately (if the
    /// parser already pushed one) or once the parser does.
    ///
    /// Returns [`CoreError::Internal`] if the registry is cancelled before
    /// the parser pushes — which happens when the session is cancelled
    /// before Claude's NDJSON output has been fully drained.
    pub async fn mcp_invoked(&self, session_key: &str) -> CoreResult<String> {
        let rx = {
            let mut state = self.inner.lock().await;
            if let Some(queue) = state.parser_queue.get_mut(session_key) {
                if let Some(id) = queue.pop_front() {
                    if queue.is_empty() {
                        state.parser_queue.remove(session_key);
                    }
                    return Ok(id);
                }
            }
            let (tx, rx) = oneshot::channel();
            state
                .mcp_waiters
                .entry(session_key.to_string())
                .or_default()
                .push_back(tx);
            rx
        };
        rx.await.map_err(|_| {
            CoreError::Internal("ask_user: cancelled before parser emitted tool_use_id".into())
        })
    }

    /// Called by the MCP HTTP handler after it has its `tool_use_id`.
    /// Blocks until [`submit_answer`] is called with the matching id or the
    /// session is cancelled.
    pub async fn mcp_await_answer(
        &self,
        session_key: &str,
        tool_use_id: &str,
    ) -> CoreResult<Value> {
        let rx = {
            let mut state = self.inner.lock().await;
            let key = (session_key.to_string(), tool_use_id.to_string());
            // If a previous waiter on the same (session, id) exists, it's a
            // bug (two MCP calls claiming the same id). Refuse the new one
            // so the bug surfaces instead of silently dropping the old.
            if state.awaiting.contains_key(&key) {
                return Err(CoreError::Conflict(format!(
                    "ask_user: another handler is already awaiting answer for {tool_use_id}"
                )));
            }
            let (tx, rx) = oneshot::channel();
            state.awaiting.insert(key, tx);
            rx
        };
        rx.await
            .map_err(|_| CoreError::Internal("ask_user: cancelled before answer arrived".into()))
    }

    /// Called by the REST `POST /v1/agents/:p/sessions/:k/user_input`
    /// handler. Delivers the user's answer to the awaiting MCP handler.
    ///
    /// Returns [`CoreError::NotFound`] if no MCP handler is currently
    /// awaiting this `(session_key, tool_use_id)`. Common reasons:
    /// session ended, question already answered, or the id is just wrong.
    pub async fn submit_answer(
        &self,
        session_key: &str,
        tool_use_id: &str,
        answer: Value,
    ) -> CoreResult<()> {
        let tx = {
            let mut state = self.inner.lock().await;
            let key = (session_key.to_string(), tool_use_id.to_string());
            state.awaiting.remove(&key).ok_or_else(|| {
                CoreError::NotFound(format!(
                    "ask_user: no pending question session={session_key} tool_use_id={tool_use_id}"
                ))
            })?
        };
        tx.send(answer).map_err(|_| {
            // The receiver was dropped between us reading the map and
            // sending — likely the MCP handler was cancelled in the same
            // tick. Surface as Conflict so the UI shows "submit failed,
            // session may have ended" rather than a generic 500.
            CoreError::Conflict("ask_user: MCP handler dropped before answer landed".into())
        })
    }

    /// Drop all pending state for a session. Called when the session is
    /// cancelled or otherwise terminated. Any in-flight `mcp_await_answer`
    /// or `mcp_invoked` resolves with an Err because the oneshot sender is
    /// dropped here.
    pub async fn cancel(&self, session_key: &str) {
        let mut state = self.inner.lock().await;
        state.parser_queue.remove(session_key);
        state.mcp_waiters.remove(session_key);
        state.awaiting.retain(|(sk, _), _| sk != session_key);
    }
}

/// Decorator [`EventSink`] that taps the per-session feed stream and notifies
/// the registry whenever an `mcp__houston__AskUserQuestion` `ToolCall` flies
/// by. Everything else (text deltas, file changes, every other tool call)
/// passes through unchanged.
///
/// This lives in front of the WS-broadcasting sink, so the registry learns
/// about the `tool_use_id` BEFORE the UI does — which closes the window where
/// a fast user could submit an answer before the MCP handler had registered
/// its waiter.
pub struct AskUserSinkTap {
    inner: DynEventSink,
    registry: PendingAskUserRegistry,
    session_key: String,
}

impl AskUserSinkTap {
    pub fn wrap(
        inner: DynEventSink,
        registry: PendingAskUserRegistry,
        session_key: String,
    ) -> DynEventSink {
        Arc::new(Self {
            inner,
            registry,
            session_key,
        })
    }
}

impl EventSink for AskUserSinkTap {
    fn emit(&self, event: HoustonEvent) {
        // Pre-flight: when the parser finalizes an AskUserQuestion
        // tool_use, push the id into the registry's queue before the
        // event is broadcast. Two emits-per-tool arrive (null-input on
        // block_start, real-input on block_stop); both carry the same
        // tool_use_id. We push on the first one we see and ignore the
        // second — the queue is keyed by FIFO push, and the second push
        // would create a phantom waiter that never resolves. Tracking
        // "already pushed" via the tool_use_id itself keeps this clean
        // without us holding parser-shaped state in this layer.
        if let HoustonEvent::FeedItem {
            session_key, item, ..
        } = &event
        {
            if session_key == &self.session_key {
                if let FeedItem::ToolCall {
                    name,
                    tool_use_id: Some(id),
                    input,
                    ..
                } = item
                {
                    if name == ASK_USER_TOOL_NAME && input.is_null() {
                        // Only the initial null-input emission counts as
                        // the "saw the tool_use" event; the second emit on
                        // content_block_stop carries the same id with the
                        // final input and would duplicate the queue push.
                        let registry = self.registry.clone();
                        let session_key = self.session_key.clone();
                        let id = id.clone();
                        tokio::spawn(async move {
                            registry.parser_saw_tool_use(&session_key, id).await;
                        });
                    }
                }
            }
        }
        self.inner.emit(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;

    const SK: &str = "test-session";

    fn answer(s: &str) -> Value {
        serde_json::json!({ "answer": s })
    }

    #[tokio::test]
    async fn parser_first_ordering() {
        // Parser emits the tool_use_id first, then the MCP handler arrives
        // and should pick it up immediately.
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_first".into()).await;
        let id = timeout(Duration::from_millis(50), reg.mcp_invoked(SK))
            .await
            .expect("should not block")
            .unwrap();
        assert_eq!(id, "tu_first");
    }

    #[tokio::test]
    async fn mcp_first_ordering() {
        // MCP handler arrives first, blocks; parser emits the id later
        // and the handler unblocks with that id.
        let reg = PendingAskUserRegistry::new();
        let reg_for_task = reg.clone();
        let handle = tokio::spawn(async move { reg_for_task.mcp_invoked(SK).await.unwrap() });

        // Give the spawned task time to register as a waiter.
        tokio::time::sleep(Duration::from_millis(10)).await;
        reg.parser_saw_tool_use(SK, "tu_late".into()).await;

        let id = timeout(Duration::from_millis(100), handle)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(id, "tu_late");
    }

    #[tokio::test]
    async fn submit_answer_unblocks_await() {
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_x".into()).await;
        let id = reg.mcp_invoked(SK).await.unwrap();
        let reg_for_task = reg.clone();
        let id_for_task = id.clone();
        let handle = tokio::spawn(async move {
            reg_for_task
                .mcp_await_answer(SK, &id_for_task)
                .await
                .unwrap()
        });

        tokio::time::sleep(Duration::from_millis(10)).await;
        reg.submit_answer(SK, &id, answer("Balance Sheet"))
            .await
            .unwrap();

        let got = timeout(Duration::from_millis(100), handle)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got, answer("Balance Sheet"));
    }

    #[tokio::test]
    async fn cancel_propagates_to_pending_await() {
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_c".into()).await;
        let id = reg.mcp_invoked(SK).await.unwrap();
        let reg_for_task = reg.clone();
        let id_for_task = id.clone();
        let handle =
            tokio::spawn(async move { reg_for_task.mcp_await_answer(SK, &id_for_task).await });

        tokio::time::sleep(Duration::from_millis(10)).await;
        reg.cancel(SK).await;

        let result = timeout(Duration::from_millis(100), handle)
            .await
            .unwrap()
            .unwrap();
        assert!(result.is_err(), "expected Err on cancel, got {result:?}");
    }

    #[tokio::test]
    async fn cancel_propagates_to_pending_invocation() {
        // MCP handler waiting for an id, session cancelled before parser
        // emits — the wait should resolve with Err.
        let reg = PendingAskUserRegistry::new();
        let reg_for_task = reg.clone();
        let handle = tokio::spawn(async move { reg_for_task.mcp_invoked(SK).await });

        tokio::time::sleep(Duration::from_millis(10)).await;
        reg.cancel(SK).await;

        let result = timeout(Duration::from_millis(100), handle)
            .await
            .unwrap()
            .unwrap();
        assert!(result.is_err(), "expected Err on cancel, got {result:?}");
    }

    #[tokio::test]
    async fn double_submit_returns_not_found() {
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_d".into()).await;
        let id = reg.mcp_invoked(SK).await.unwrap();
        let reg_for_task = reg.clone();
        let id_for_task = id.clone();
        let _handle = tokio::spawn(async move {
            reg_for_task
                .mcp_await_answer(SK, &id_for_task)
                .await
                .unwrap()
        });
        tokio::time::sleep(Duration::from_millis(10)).await;

        reg.submit_answer(SK, &id, answer("first")).await.unwrap();
        let second = reg.submit_answer(SK, &id, answer("second")).await;
        assert!(matches!(second, Err(CoreError::NotFound(_))));
    }

    #[tokio::test]
    async fn submit_unknown_id_returns_not_found() {
        let reg = PendingAskUserRegistry::new();
        let result = reg.submit_answer(SK, "tu_never", answer("anything")).await;
        assert!(matches!(result, Err(CoreError::NotFound(_))));
    }

    #[tokio::test]
    async fn sessions_are_isolated() {
        // Pushing an id for session A must not satisfy an MCP handler
        // waiting on session B.
        let reg = PendingAskUserRegistry::new();
        let reg_for_task = reg.clone();
        let handle = tokio::spawn(async move {
            timeout(
                Duration::from_millis(40),
                reg_for_task.mcp_invoked("session-b"),
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(5)).await;
        reg.parser_saw_tool_use("session-a", "tu_for_a".into())
            .await;
        // session-b should still be waiting (and eventually timeout).
        let outer = handle.await.unwrap();
        assert!(
            outer.is_err(),
            "session-b should have timed out, got {outer:?}"
        );
    }

    #[tokio::test]
    async fn queue_drains_in_fifo_order() {
        // Multiple parser pushes followed by multiple mcp_invoked calls
        // should pair up in FIFO order. This is the safety net for the
        // unlikely-but-possible case where two tool_use_ids land before
        // any MCP handler arrives.
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_1".into()).await;
        reg.parser_saw_tool_use(SK, "tu_2".into()).await;
        let id1 = reg.mcp_invoked(SK).await.unwrap();
        let id2 = reg.mcp_invoked(SK).await.unwrap();
        assert_eq!(id1, "tu_1");
        assert_eq!(id2, "tu_2");
    }

    #[tokio::test]
    async fn double_await_same_id_is_conflict() {
        // Two MCP handlers claiming the same (session, tool_use_id) is a
        // bug — surface as Conflict so it doesn't silently drop the first.
        let reg = PendingAskUserRegistry::new();
        reg.parser_saw_tool_use(SK, "tu_dup".into()).await;
        let id = reg.mcp_invoked(SK).await.unwrap();

        let reg_for_task = reg.clone();
        let id_for_task = id.clone();
        let _first =
            tokio::spawn(async move { reg_for_task.mcp_await_answer(SK, &id_for_task).await });
        tokio::time::sleep(Duration::from_millis(10)).await;

        let second = reg.mcp_await_answer(SK, &id).await;
        assert!(matches!(second, Err(CoreError::Conflict(_))));
    }
}
