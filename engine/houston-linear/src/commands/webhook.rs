//! Transport-neutral webhook ingestion.
//!
//! Engine-server route (`POST /v1/trackers/linear/webhook?workspacePath=...`)
//! lifts [`handle_delivery`]. The function is sync-friendly: signature
//! verify is CPU-bound; ledger I/O is blocking. No tokio runtime required
//! for unit-testing.
//!
//! ## Linear's webhook contract (HARD)
//!
//! Linear retries any non-2xx response. The engine MUST return 200 within
//! 5 s of receipt — even for signature failures (don't leak verification
//! state to attackers) and duplicates (idempotent). The caller (the route
//! handler) is responsible for that 200; this function returns the
//! *outcome* it observed so the route can log + respond appropriately.

use crate::connection::ConnectionMeta;
use crate::error::LinearError;
use crate::keychain;
use crate::webhook_ledger::{self, LedgerEntry, RecordOutcome};
use crate::webhooks;
use std::path::Path;

/// Outcome of a single Linear webhook delivery. Three states are
/// possible: accepted (first time seen, ledger appended), duplicate
/// (dedupe-skipped), or hard-rejected (sig or replay failure).
/// Rejections come back as `Err(LinearError::*)` from [`handle_delivery`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WebhookOutcome {
    /// First time we've seen this `webhookId` — recorded.
    Accepted { event_type: String, action: String },
    /// Same `webhookId` seen before — no side effects.
    Duplicate,
}

/// Verify + dedup + append a single webhook delivery.
///
/// Steps (fail-fast):
/// 1. Parse `Linear-Timestamp` → check replay window.
/// 2. Load the workspace's `connection.json` → get `org_id`.
/// 3. Load the per-org `StoredTokens` from keychain → extract
///    `webhook_secret`. Missing secret == treat as signature failure
///    (we can't verify without the key).
/// 4. HMAC-verify the raw `body` against `signature_header`.
/// 5. Parse minimal envelope (`webhookId` + `type` + `action`).
/// 6. Record to the on-disk ledger; dedupe-skip if already present.
///
/// `now_unix_ms` is the engine's current wall-clock — injected for
/// testability (real callers pass `chrono::Utc::now().timestamp_millis()`).
pub fn handle_delivery(
    workspace_path: &Path,
    body: &[u8],
    signature_header: &str,
    timestamp_header: &str,
    now_unix_ms: i64,
) -> Result<WebhookOutcome, LinearError> {
    // 1. Replay window. Cheap; bail before any I/O if stale.
    let delivered_ms: i64 = timestamp_header
        .trim()
        .parse()
        .map_err(|_| LinearError::WebhookReplay)?;
    webhooks::check_replay_window(now_unix_ms, delivered_ms)?;

    // 2 + 3. Look up the per-org webhook secret.
    let meta = ConnectionMeta::load(workspace_path)?;
    let tokens = keychain::load(&meta.org_id)?;
    let secret = tokens.webhook_secret.ok_or(LinearError::WebhookSignature)?;

    // 4. HMAC verify — constant-time inside.
    webhooks::verify_signature(secret.as_bytes(), body, signature_header)?;

    // 5. Parse envelope (minimal — we don't validate `data` here;
    //    that's the projection / agent-session layer's job).
    #[derive(serde::Deserialize)]
    struct Envelope {
        #[serde(rename = "webhookId")]
        webhook_id: String,
        #[serde(rename = "type")]
        event_type: String,
        action: String,
    }
    let env: Envelope = serde_json::from_slice(body)?;

    // 6. Append to ledger (or skip if duplicate).
    let payload: serde_json::Value = serde_json::from_slice(body)?;
    let entry = LedgerEntry {
        webhook_id: env.webhook_id,
        delivered_at: chrono::Utc::now().to_rfc3339(),
        event_type: env.event_type.clone(),
        action: env.action.clone(),
        payload,
    };

    Ok(
        match webhook_ledger::record_if_new(workspace_path, entry)? {
            RecordOutcome::Recorded => WebhookOutcome::Accepted {
                event_type: env.event_type,
                action: env.action,
            },
            RecordOutcome::Duplicate => WebhookOutcome::Duplicate,
        },
    )
}

#[cfg(test)]
mod tests {
    //! Note: unit-testing the full pipeline requires a populated
    //! connection.json + keychain entry. Those subsystems have their
    //! own tests. Here we cover the *input-validation* branches that
    //! fail before touching disk.

    use super::*;
    use tempfile::TempDir;

    #[test]
    fn malformed_timestamp_is_replay_error() {
        let dir = TempDir::new().unwrap();
        let err = handle_delivery(dir.path(), b"{}", "deadbeef", "not-a-number", 0).unwrap_err();
        assert!(matches!(err, LinearError::WebhookReplay));
    }

    #[test]
    fn stale_timestamp_rejected_before_disk_lookup() {
        let dir = TempDir::new().unwrap();
        let now = 1_716_473_400_000_i64;
        let very_old = (now / 1_000 - 10_000).to_string();
        // No connection.json exists; if the replay check fires first
        // (as it should) we get WebhookReplay, not NotAuthenticated.
        let err = handle_delivery(dir.path(), b"{}", "deadbeef", &very_old, now).unwrap_err();
        assert!(matches!(err, LinearError::WebhookReplay));
    }

    #[test]
    fn unconnected_workspace_is_not_authenticated() {
        // Fresh timestamp (replay check passes), no connection.json →
        // NotAuthenticated. Both `now_unix_ms` AND the header value
        // are millis — Linear's `Linear-Timestamp` is documented as
        // unix-milliseconds.
        let dir = TempDir::new().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let ts = now.to_string();
        let err = handle_delivery(dir.path(), b"{}", "deadbeef", &ts, now).unwrap_err();
        assert!(matches!(err, LinearError::NotAuthenticated), "got: {err:?}");
    }
}
