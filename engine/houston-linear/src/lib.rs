//! houston-linear — Linear project-tracker integration for Houston.
//!
//! Speaks GraphQL directly to `api.linear.app` via the `cynic` codegen
//! client (added in C1.5). Owns OAuth 2.0 install + refresh, webhook
//! HMAC verification + idempotency, Linear's AgentSession protocol
//! implementation, polling reconciliation, and a complexity-aware
//! rate-limit budgeter (3M points/hour per OAuth app).
//!
//! Concrete crate — no `TicketProvider` trait. Rule-of-three applies:
//! extract `engine/houston-tracker-port` only when concrete impl #2
//! ships to production AND #3 is on the immediate roadmap. Until then,
//! Houston-Linear is Linear-native and the engine-core knows about
//! this crate directly. See
//! [`docs/specs/2026-05-23-tracker-integration.html`] for the V1
//! architecture contract.
//!
//! ## Crate boundary
//!
//! Transport-neutral. No Tauri, no React, no webview assumption.
//! `houston-engine-core` depends on this crate; the Tauri adapter
//! (`app/houston-tauri`) does not.
//!
//! ## Module map
//!
//! - [`auth`] — OAuth 2.0 install flow + macOS keychain storage +
//!   mutex-guarded refresh.
//! - [`queries`] — typed GraphQL queries (cynic codegen, populated in
//!   C1.5).
//! - [`mutations`] — typed GraphQL mutations (cynic codegen, populated
//!   in C1.5).
//! - [`webhooks`] — HMAC-SHA256 verification, `Linear-Timestamp` replay
//!   defense, `webhookId` idempotency.
//! - [`agent_session`] — Linear 2026 AppUser + AgentSession protocol;
//!   5-second response budget; ingress/egress event handling.
//! - [`reconcile`] — polling backstop for missed webhook deliveries
//!   (`updatedAt > checkpoint` paginated puller).
//! - [`rate_limit`] — rolling token bucket against Linear's 3M
//!   complexity-points-per-hour quota. Explicit `first: N` on every
//!   paginated query.
//! - [`error`] — typed [`LinearError`] enum.

pub mod agent_session;
pub mod auth;
pub mod callback;
pub mod commands;
pub mod connection;
pub mod error;
pub mod keychain;
pub mod mutations;
pub mod pending;
pub mod queries;
pub mod rate_limit;
pub mod reconcile;
pub mod webhooks;

pub use callback::CallbackParams;
pub use connection::{ConnectionMeta, OrgInfo};
pub use error::LinearError;
pub use keychain::StoredTokens;
pub use pending::{PendingStore, TakenState};

/// Linear's GraphQL endpoint.
pub const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";

/// Linear's OAuth authorize URL (workspace install).
pub const LINEAR_OAUTH_AUTHORIZE_URL: &str = "https://linear.app/oauth/authorize";

/// Linear's OAuth token-exchange endpoint.
pub const LINEAR_OAUTH_TOKEN_URL: &str = "https://api.linear.app/oauth/token";

/// Linear's webhook signature header (HMAC-SHA256 over the raw request
/// body, lowercase hex-encoded).
pub const LINEAR_SIGNATURE_HEADER: &str = "Linear-Signature";

/// Linear's webhook timestamp header (Unix milliseconds since epoch).
/// Deliveries older than [`WEBHOOK_REPLAY_WINDOW_SECS`] are rejected.
pub const LINEAR_TIMESTAMP_HEADER: &str = "Linear-Timestamp";

/// Reject webhook deliveries whose `Linear-Timestamp` is older than this
/// many seconds — replay-attack defense.
pub const WEBHOOK_REPLAY_WINDOW_SECS: i64 = 300;

/// AgentSession response budget — engine MUST emit a `working` event
/// back to Linear within this many milliseconds of event receipt.
/// Exceeding it produces [`LinearError::AgentSessionBudget`] and lets
/// the engine fail loudly per the no-silent-failures policy.
pub const AGENT_SESSION_RESPONSE_BUDGET_MS: u64 = 5_000;

/// Linear's per-OAuth-app complexity-points budget per hour.
pub const RATE_LIMIT_POINTS_PER_HOUR: u32 = 3_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graphql_url_is_canonical() {
        assert_eq!(LINEAR_GRAPHQL_URL, "https://api.linear.app/graphql");
    }

    #[test]
    fn oauth_endpoints_are_canonical() {
        assert_eq!(
            LINEAR_OAUTH_AUTHORIZE_URL,
            "https://linear.app/oauth/authorize"
        );
        assert_eq!(LINEAR_OAUTH_TOKEN_URL, "https://api.linear.app/oauth/token");
    }

    #[test]
    fn agent_session_budget_matches_spec() {
        // Spec: 5-second response budget. Don't let this drift silently.
        assert_eq!(AGENT_SESSION_RESPONSE_BUDGET_MS, 5_000);
    }

    #[test]
    fn rate_limit_budget_matches_linear_docs() {
        // Per Linear's developer docs (verified May 2026):
        // 3,000,000 complexity points per hour per OAuth app.
        assert_eq!(RATE_LIMIT_POINTS_PER_HOUR, 3_000_000);
    }

    #[test]
    fn webhook_replay_window_is_five_minutes() {
        assert_eq!(WEBHOOK_REPLAY_WINDOW_SECS, 300);
    }
}
