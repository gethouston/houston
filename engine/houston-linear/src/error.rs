//! Error taxonomy for the Linear adapter.
//!
//! Per CLAUDE.md "type safety over strings": every domain failure mode
//! is a typed variant, not a [`String`]. The frontend's error-card
//! component (`provider-error-card.tsx`) matches on variant names to
//! render variant-specific reconnect / report-bug flows.
//!
//! Per CLAUDE.md "no silent failures": every variant surfaces. The
//! engine's [`ApiError`](houston_engine_protocol::error) wraps these
//! and the frontend toast hook displays them — see the surfacing path
//! in `knowledge-base/tracker-integration.md`.

use thiserror::Error;

/// Failure modes the Linear adapter can produce.
///
/// Variants are stable contracts the frontend matches on; renames
/// require a coordinated frontend + protocol DTO update.
#[derive(Debug, Error)]
pub enum LinearError {
    /// Network-layer failure (DNS, TLS, connection reset, timeout).
    /// Carries the underlying [`reqwest::Error`] for diagnostics.
    #[error("Linear API request failed: {0}")]
    Network(#[from] reqwest::Error),

    /// OAuth flow failed — invalid code, expired state, revoked
    /// client, scope mismatch. Body carries Linear's diagnostic.
    #[error("Linear OAuth flow failed: {0}")]
    Oauth(String),

    /// Rate-limit budget exhausted. Engine pauses non-essential calls
    /// until the rolling window refills. Webhook-driven mutations are
    /// prioritized over polling refreshes when this fires.
    #[error("Linear rate limit exhausted (3M pts/hr budget hit)")]
    RateLimited,

    /// Webhook HMAC verification failed. Either the secret is wrong
    /// or the payload was tampered. Engine rejects + logs.
    #[error("Linear webhook signature verification failed")]
    WebhookSignature,

    /// Webhook timestamp outside the replay window (default 5 min).
    /// Engine rejects to prevent replay attacks.
    #[error("Linear webhook replay window exceeded (stale Linear-Timestamp)")]
    WebhookReplay,

    /// Linear's GraphQL response carried `errors[]`. Body is the
    /// joined error message; engine surfaces to UI when user-initiated.
    #[error("Linear GraphQL errors: {0}")]
    Graphql(String),

    /// Linear's API returned a shape that does not match what
    /// `cynic`-generated types expect. Likely a schema drift event —
    /// engineer should refresh the vendored schema via
    /// `scripts/refresh-linear-schema.sh`.
    #[error("Linear API response shape unexpected: {0}")]
    SchemaDrift(String),

    /// AgentSession 5-second response budget exceeded. Engine emits
    /// an `error` event back to Linear and marks the session stalled.
    #[error("Linear AgentSession 5s response budget exceeded")]
    AgentSessionBudget,

    /// No OAuth token on file for this workspace. UI prompts user to
    /// connect via Settings → Workspace → Linear.
    #[error("not authenticated with Linear (no OAuth token)")]
    NotAuthenticated,

    /// macOS keychain operation failed (read, write, delete). Carries
    /// the OS-level diagnostic.
    #[error("Linear keychain access failed: {0}")]
    Keychain(String),

    /// JSON parsing failure on a Linear response or webhook payload.
    #[error("Linear JSON parse failed: {0}")]
    Json(#[from] serde_json::Error),

    /// Local filesystem I/O failure on a Linear adapter mirror file
    /// (connection.json, sync_state.json, raw/* projections, webhook
    /// ledger). Carries the OS-level diagnostic. Distinct from
    /// [`LinearError::Oauth`], which is reserved for OAuth-protocol
    /// failures (token exchange, callback handling, URL parsing).
    #[error("Linear adapter I/O failed: {0}")]
    Io(String),

    /// Webhook delivery duplicated — same `webhookId` already present
    /// in the on-disk ledger. The engine still ACKs Linear with 200
    /// (their spec), but the projection / agent-session dispatch is
    /// skipped. Surfaces in logs and the webhook-route response.
    #[error("Linear webhook duplicate (already in ledger)")]
    WebhookDuplicate,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limited_message_mentions_budget() {
        let err = LinearError::RateLimited;
        let msg = format!("{}", err);
        assert!(msg.contains("rate limit"), "got: {msg}");
        assert!(msg.contains("3M"), "got: {msg}");
    }

    #[test]
    fn agent_session_budget_message_mentions_5s() {
        let err = LinearError::AgentSessionBudget;
        let msg = format!("{}", err);
        assert!(msg.contains("5s"), "got: {msg}");
    }

    #[test]
    fn webhook_signature_distinct_from_replay() {
        let sig = format!("{}", LinearError::WebhookSignature);
        let replay = format!("{}", LinearError::WebhookReplay);
        assert_ne!(sig, replay);
        assert!(sig.contains("signature"));
        assert!(replay.contains("replay"));
    }

    #[test]
    fn io_variant_distinct_from_oauth() {
        // Renaming Oauth → Io for filesystem ops was the canonical
        // type-safety win for C3. They must not collide.
        let io = format!("{}", LinearError::Io("disk full".into()));
        let oauth = format!("{}", LinearError::Oauth("bad code".into()));
        assert!(io.contains("I/O"));
        assert!(oauth.contains("OAuth"));
        assert_ne!(io, oauth);
    }

    #[test]
    fn webhook_duplicate_distinct_from_signature_and_replay() {
        let dup = format!("{}", LinearError::WebhookDuplicate);
        let sig = format!("{}", LinearError::WebhookSignature);
        let replay = format!("{}", LinearError::WebhookReplay);
        assert!(dup.contains("duplicate"));
        assert_ne!(dup, sig);
        assert_ne!(dup, replay);
    }

    #[test]
    fn json_errors_auto_convert() {
        // serde_json failures should flow through `?` without manual
        // mapping — the `From` impl is the no-silent-failures glue.
        fn parses() -> Result<serde_json::Value, LinearError> {
            let v: serde_json::Value = serde_json::from_str("not json")?;
            Ok(v)
        }
        let err = parses().unwrap_err();
        assert!(matches!(err, LinearError::Json(_)));
    }
}
