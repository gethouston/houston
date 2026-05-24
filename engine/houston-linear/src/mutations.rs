//! Typed GraphQL mutations against Linear's schema.
//!
//! Codegen target is `engine/houston-linear/schema/linear.graphql`
//! (vendored; refresh via `scripts/refresh-linear-schema.sh`).
//!
//! Mutations Houston writes to Linear are deliberately narrow — the
//! engine never replicates Linear's UI; it only writes the state
//! Houston is canonical for:
//!
//! - [`agent_activity::CreateAgentActivity`] — AppUser-side
//!   AgentSession event egress (thought / action / response /
//!   elicitation / error). Houston posts these back as a delegated
//!   session progresses.
//! - `issueUpdate` — state transitions, assignee change (Houston-side
//!   writeback after a session completes). Not implemented in V1
//!   (Linear's webhook stream handles state changes; Houston is
//!   read-mostly for issue fields).
//! - `commentCreate` — append a session-completion summary to the
//!   issue thread. Folded into `agentActivityCreate` for V1 (the
//!   `response` activity type IS the comment).
//!
//! ## AppUser registration
//!
//! Linear's 2026 protocol does *not* require an explicit
//! `agentSessionRegister` mutation — the OAuth user installed with
//! `app:assignable` + `app:mentionable` scopes IS the AppUser for the
//! org. Houston's existing viewer query ([`crate::queries::viewer`])
//! resolves it on first connect; the result persists to
//! `connection.json::app_user_id`.

pub mod agent_activity;
