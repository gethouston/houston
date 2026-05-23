//! Webhook verification + idempotency.
//!
//! Linear delivery semantics:
//! - **At-least-once, no ordering.** Engine MUST tolerate duplicate
//!   deliveries and out-of-order receipt. Idempotent re-projection
//!   from the raw event ledger absorbs both.
//! - **HMAC-SHA256** over the raw request body. Header
//!   [`crate::LINEAR_SIGNATURE_HEADER`]. Secret is per-connection,
//!   stored in macOS keychain via the `webhook_secret_ref` field on
//!   `connection.json`.
//! - **Replay defense** via [`crate::LINEAR_TIMESTAMP_HEADER`]; engine
//!   rejects deliveries older than [`crate::WEBHOOK_REPLAY_WINDOW_SECS`].
//! - **Retry policy (Linear-side)**: 3 retries at +1m / +1h / +6h,
//!   then auto-disable. Polling reconciliation ([`crate::reconcile`])
//!   backstops missed deliveries.
//!
//! ## Idempotency ledger
//!
//! Every accepted webhook delivery appends one line to
//! `.houston/trackers/linear/raw/webhook_events.jsonl`. Each line is
//! a JSON object with at least `{ webhookId, deliveredAt, payload }`.
//! Engine projects from this ledger; duplicate `webhookId` values are
//! dedupe-skipped at projection time. The ledger is append-only;
//! never compacted (Linear webhooks are small).
//!
//! Populated in C2 onwards.

use crate::error::LinearError;

/// Verify a Linear webhook's HMAC signature.
///
/// `secret` is the per-connection webhook secret retrieved from the
/// macOS keychain. `signature_header` is the lowercase hex string from
/// [`crate::LINEAR_SIGNATURE_HEADER`]. `body` MUST be the raw request
/// bytes — not re-serialized JSON — because Linear computes the HMAC
/// over the exact bytes it sent.
///
/// Returns [`LinearError::WebhookSignature`] on mismatch. Implementation
/// uses constant-time comparison (`subtle::ConstantTimeEq`) to avoid
/// timing side-channels.
pub fn verify_signature(
    _secret: &[u8],
    _body: &[u8],
    _signature_header: &str,
) -> Result<(), LinearError> {
    Err(LinearError::WebhookSignature)
}

/// Reject deliveries whose `Linear-Timestamp` is outside the replay
/// window. `now_unix_ms` is the engine's current wall-clock time;
/// `delivered_unix_ms` is the value of [`crate::LINEAR_TIMESTAMP_HEADER`].
///
/// Returns [`LinearError::WebhookReplay`] when the timestamp is older
/// than [`crate::WEBHOOK_REPLAY_WINDOW_SECS`] seconds.
pub fn check_replay_window(now_unix_ms: i64, delivered_unix_ms: i64) -> Result<(), LinearError> {
    let age_secs = (now_unix_ms - delivered_unix_ms) / 1_000;
    if age_secs > crate::WEBHOOK_REPLAY_WINDOW_SECS {
        return Err(LinearError::WebhookReplay);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WEBHOOK_REPLAY_WINDOW_SECS;

    #[test]
    fn replay_window_accepts_fresh_delivery() {
        let now = 1_716_473_400_000_i64; // arbitrary 2026-05 epoch
        let delivered = now - 1_000; // 1 second old
        assert!(check_replay_window(now, delivered).is_ok());
    }

    #[test]
    fn replay_window_rejects_stale_delivery() {
        let now = 1_716_473_400_000_i64;
        // Older than the window
        let delivered = now - (WEBHOOK_REPLAY_WINDOW_SECS + 1) * 1_000;
        let err = check_replay_window(now, delivered).unwrap_err();
        assert!(matches!(err, LinearError::WebhookReplay));
    }

    #[test]
    fn replay_window_accepts_boundary() {
        let now = 1_716_473_400_000_i64;
        // Exactly at the window edge — accepted.
        let delivered = now - WEBHOOK_REPLAY_WINDOW_SECS * 1_000;
        assert!(check_replay_window(now, delivered).is_ok());
    }

    #[test]
    fn verify_signature_placeholder_fails_loudly() {
        // C1 placeholder returns WebhookSignature — caller surfaces.
        // C2 will swap with real HMAC verification.
        let err = verify_signature(b"secret", b"body", "deadbeef").unwrap_err();
        assert!(matches!(err, LinearError::WebhookSignature));
    }
}
