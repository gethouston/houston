//! Webhook signature verification + replay-window defense.
//!
//! Linear delivery semantics:
//! - **At-least-once, no ordering.** Engine MUST tolerate duplicate
//!   deliveries and out-of-order receipt. The on-disk ledger
//!   ([`crate::webhook_ledger`]) absorbs duplicates; idempotent
//!   re-projection absorbs reordering.
//! - **HMAC-SHA256** over the raw request body. Header
//!   [`crate::LINEAR_SIGNATURE_HEADER`]. Secret is per-connection,
//!   stored in macOS keychain via the `webhook_secret_ref` field on
//!   `connection.json` and loaded via
//!   [`crate::keychain::load`].
//! - **Replay defense** via [`crate::LINEAR_TIMESTAMP_HEADER`]; engine
//!   rejects deliveries older than [`crate::WEBHOOK_REPLAY_WINDOW_SECS`].
//! - **Retry policy (Linear-side)**: 3 retries at +1m / +1h / +6h,
//!   then auto-disable. Polling reconciliation ([`crate::reconcile`])
//!   backstops missed deliveries.
//!
//! ## Idempotency
//!
//! See [`crate::webhook_ledger`] for the JSONL ledger that dedupes by
//! Linear's `webhookId`. Sig + replay are *transport-layer* checks
//! handled here; dedup is the *delivery-layer* check handled there.

use crate::error::LinearError;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Verify a Linear webhook's HMAC-SHA256 signature.
///
/// `secret` is the per-connection webhook secret retrieved from the
/// macOS keychain. `signature_header` is the lowercase hex string from
/// [`crate::LINEAR_SIGNATURE_HEADER`] — Linear sends 64 hex chars
/// (SHA-256 = 32 bytes). `body` MUST be the raw request bytes — not
/// re-serialized JSON — because Linear computes the HMAC over the
/// exact bytes it sent.
///
/// Comparison uses [`subtle::ConstantTimeEq`] to avoid timing
/// side-channels. Returns [`LinearError::WebhookSignature`] on any
/// mismatch (wrong length, non-hex chars, wrong secret, tampered body).
pub fn verify_signature(
    secret: &[u8],
    body: &[u8],
    signature_header: &str,
) -> Result<(), LinearError> {
    let expected = decode_hex_sha256(signature_header.trim())?;

    let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| LinearError::WebhookSignature)?;
    mac.update(body);
    let computed = mac.finalize().into_bytes();

    // computed: GenericArray<u8, 32>; expected: [u8; 32].
    if computed.as_slice().ct_eq(&expected[..]).into() {
        Ok(())
    } else {
        Err(LinearError::WebhookSignature)
    }
}

/// Decode a 64-char lowercase hex string into a 32-byte array.
///
/// Hand-rolled to keep the dep tree slim — `hex` would add a crate
/// for ~10 lines of work. Rejects any non-hex char and any length
/// other than 64.
fn decode_hex_sha256(s: &str) -> Result<[u8; 32], LinearError> {
    if s.len() != 64 {
        return Err(LinearError::WebhookSignature);
    }
    let bytes = s.as_bytes();
    let mut out = [0u8; 32];
    for i in 0..32 {
        let hi = nibble(bytes[i * 2])?;
        let lo = nibble(bytes[i * 2 + 1])?;
        out[i] = (hi << 4) | lo;
    }
    Ok(out)
}

fn nibble(b: u8) -> Result<u8, LinearError> {
    match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err(LinearError::WebhookSignature),
    }
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
    use hmac::Mac as _;

    fn sign(secret: &[u8], body: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(body);
        let out = mac.finalize().into_bytes();
        let mut s = String::with_capacity(64);
        for b in out.iter() {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }

    #[test]
    fn verify_signature_accepts_valid_hmac() {
        let secret = b"shhh-its-a-secret";
        let body = br#"{"webhookId":"abc","type":"Issue","action":"create"}"#;
        let sig = sign(secret, body);
        assert!(verify_signature(secret, body, &sig).is_ok());
    }

    #[test]
    fn verify_signature_accepts_uppercase_hex() {
        // Linear sends lowercase; accept uppercase defensively.
        let secret = b"k";
        let body = b"{}";
        let sig = sign(secret, body).to_uppercase();
        assert!(verify_signature(secret, body, &sig).is_ok());
    }

    #[test]
    fn verify_signature_rejects_tampered_body() {
        let secret = b"k";
        let body = br#"{"a":1}"#;
        let sig = sign(secret, body);
        let tampered = br#"{"a":2}"#;
        let err = verify_signature(secret, tampered, &sig).unwrap_err();
        assert!(matches!(err, LinearError::WebhookSignature));
    }

    #[test]
    fn verify_signature_rejects_wrong_secret() {
        let body = b"hi";
        let sig = sign(b"alice", body);
        let err = verify_signature(b"bob", body, &sig).unwrap_err();
        assert!(matches!(err, LinearError::WebhookSignature));
    }

    #[test]
    fn verify_signature_rejects_bad_length() {
        let err = verify_signature(b"k", b"x", "deadbeef").unwrap_err();
        assert!(matches!(err, LinearError::WebhookSignature));
    }

    #[test]
    fn verify_signature_rejects_non_hex_chars() {
        let s: String = "z".repeat(64);
        let err = verify_signature(b"k", b"x", &s).unwrap_err();
        assert!(matches!(err, LinearError::WebhookSignature));
    }

    #[test]
    fn verify_signature_trims_whitespace() {
        // Some proxies append \r\n; we should tolerate trailing
        // whitespace in the header value.
        let secret = b"k";
        let body = b"{}";
        let sig = sign(secret, body);
        let padded = format!("  {sig}\r\n");
        assert!(verify_signature(secret, body, &padded).is_ok());
    }

    #[test]
    fn replay_window_accepts_fresh_delivery() {
        let now = 1_716_473_400_000_i64;
        let delivered = now - 1_000; // 1 second old
        assert!(check_replay_window(now, delivered).is_ok());
    }

    #[test]
    fn replay_window_rejects_stale_delivery() {
        let now = 1_716_473_400_000_i64;
        let delivered = now - (WEBHOOK_REPLAY_WINDOW_SECS + 1) * 1_000;
        let err = check_replay_window(now, delivered).unwrap_err();
        assert!(matches!(err, LinearError::WebhookReplay));
    }

    #[test]
    fn replay_window_accepts_boundary() {
        let now = 1_716_473_400_000_i64;
        let delivered = now - WEBHOOK_REPLAY_WINDOW_SECS * 1_000;
        assert!(check_replay_window(now, delivered).is_ok());
    }
}
