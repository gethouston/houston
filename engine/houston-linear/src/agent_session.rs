//! Linear's 2026 AppUser + AgentSession protocol.
//!
//! Linear's directional bet for the agent era. Linear delegates work
//! to a Houston AppUser (one per connected workspace); the
//! AgentSessionEvent webhook stream is the conversation thread.
//!
//! ## Response budget (HARD)
//!
//! Engine MUST emit a `working` event back to Linear within
//! [`crate::AGENT_SESSION_RESPONSE_BUDGET_MS`] of event receipt.
//! Missing the budget produces [`LinearError::AgentSessionBudget`].
//!
//! The 5-second budget covers the **first** response. The Houston
//! session itself may run for minutes (real CLI agents are slow);
//! subsequent events (`thought`, `action`, `complete`, `error`) flow
//! back as the session progresses.
//!
//! ## Event taxonomy
//!
//! Ingress (Linear → Houston):
//! - `delegate` — issue assigned to or @-mention of Houston AppUser.
//! - Subsequent user messages in the thread.
//!
//! Egress (Houston → Linear):
//! - `working` — acknowledgement within 5s budget.
//! - `thought` — visible reasoning step (model output snippets).
//! - `action` — tool call / file write (filtered through Houston's
//!   non-technical-voice product prompt before surfacing to Linear).
//! - `complete` — terminal success; comment posted, state updated.
//! - `error` — terminal failure; user sees a Report-bug card on Linear.
//!
//! ## Routing
//!
//! On ingress, the engine consults the workspace's `routing.json`
//! policy: `(team_uuid, label_set, project_uuid) → houston_agent_path`.
//! The matched Houston agent receives a chat session start with the
//! Linear issue body + labels + parent project + recent comments
//! injected into the prompt context.
//!
//! ## AppUser registration
//!
//! On first OAuth install, the engine calls `agentSessionRegister`
//! (see [`crate::mutations`]) to declare Houston-as-AppUser in the
//! connected org. The returned `app_user_id` persists to the
//! workspace's `connection.json`.
//!
//! Populated in C2 onwards.
