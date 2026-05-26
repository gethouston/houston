//! HMAC verification for Beltic webhook deliveries.
//!
//! Wire format (verified against `apps/api/credentials/src/operations/audit/streams/hmac-sign.ts`
//! in the Beltic platform):
//!
//!   Beltic-Signature: sha256=<lowercase-hex>
//!   Beltic-Timestamp: <unix-seconds>
//!
//! Signed payload is `format!("{timestamp}.{raw_body}")`. Anti-replay: reject
//! deliveries whose timestamp differs from `now()` by more than `tolerance`
//! seconds (Beltic recommends 300).
//!
//! Constant-time compare guards against timing oracles.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

use crate::errors::{BelticError, BelticResult};

pub const SIGNATURE_HEADER: &str = "Beltic-Signature";
pub const TIMESTAMP_HEADER: &str = "Beltic-Timestamp";
pub const DEFAULT_TOLERANCE_SECS: i64 = 300;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct WebhookVerifier {
    secret: Vec<u8>,
    tolerance_secs: i64,
}

impl WebhookVerifier {
    /// Same value as the free `SIGNATURE_HEADER` constant — duplicated as
    /// an associated constant for ergonomic `WebhookVerifier::SIGNATURE_HEADER`
    /// access from route handlers that hold the type but not the module path.
    pub const SIGNATURE_HEADER: &'static str = SIGNATURE_HEADER;
    pub const TIMESTAMP_HEADER: &'static str = TIMESTAMP_HEADER;

    pub fn new(secret: impl Into<Vec<u8>>) -> BelticResult<Self> {
        let secret = secret.into();
        if secret.is_empty() {
            return Err(BelticError::Configuration(
                "beltic webhook_secret must not be empty".into(),
            ));
        }
        Ok(Self {
            secret,
            tolerance_secs: DEFAULT_TOLERANCE_SECS,
        })
    }

    pub fn with_tolerance_secs(mut self, secs: i64) -> Self {
        self.tolerance_secs = secs;
        self
    }

    /// Returns `Ok(())` if signature + timestamp are both valid. Otherwise a
    /// typed `BelticError::WebhookSignature`. The caller decides whether to
    /// 401 or 400 based on whether parsing failed vs. crypto failed.
    pub fn verify(
        &self,
        raw_body: &[u8],
        signature_header: Option<&str>,
        timestamp_header: Option<&str>,
        now_unix_secs: i64,
    ) -> BelticResult<()> {
        let ts = parse_timestamp(timestamp_header)?;
        check_freshness(ts, now_unix_secs, self.tolerance_secs)?;
        let provided_sig = parse_signature(signature_header)?;
        let expected = self.sign(ts, raw_body);
        if bool::from(provided_sig.as_slice().ct_eq(expected.as_slice())) {
            Ok(())
        } else {
            Err(BelticError::WebhookSignature(
                "Beltic-Signature does not match expected HMAC".into(),
            ))
        }
    }

    fn sign(&self, ts: i64, body: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .expect("HMAC key length is valid for any byte slice");
        mac.update(ts.to_string().as_bytes());
        mac.update(b".");
        mac.update(body);
        mac.finalize().into_bytes().to_vec()
    }
}

fn parse_timestamp(header: Option<&str>) -> BelticResult<i64> {
    let raw = header
        .filter(|s| !s.is_empty())
        .ok_or_else(|| BelticError::WebhookSignature("Beltic-Timestamp header missing".into()))?;
    raw.parse::<i64>().map_err(|_| {
        BelticError::WebhookSignature(format!(
            "Beltic-Timestamp not numeric (got {raw:?})"
        ))
    })
}

fn check_freshness(ts: i64, now: i64, tolerance: i64) -> BelticResult<()> {
    let delta = (now - ts).abs();
    if delta <= tolerance {
        Ok(())
    } else {
        Err(BelticError::WebhookSignature(format!(
            "Beltic-Timestamp {ts} is outside the {tolerance}s tolerance (delta={delta}s)"
        )))
    }
}

fn parse_signature(header: Option<&str>) -> BelticResult<Vec<u8>> {
    let raw = header
        .filter(|s| !s.is_empty())
        .ok_or_else(|| BelticError::WebhookSignature("Beltic-Signature header missing".into()))?;
    let hex = raw.strip_prefix("sha256=").ok_or_else(|| {
        BelticError::WebhookSignature(format!(
            "Beltic-Signature must use sha256= prefix (got {raw:?})"
        ))
    })?;
    hex::decode(hex)
        .map_err(|e| BelticError::WebhookSignature(format!("Beltic-Signature hex malformed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"test-webhook-secret-that-is-long-enough";

    fn sign_for_test(ts: i64, body: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(SECRET).unwrap();
        mac.update(ts.to_string().as_bytes());
        mac.update(b".");
        mac.update(body);
        format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
    }

    #[test]
    fn rejects_empty_secret() {
        let err = WebhookVerifier::new(Vec::<u8>::new()).unwrap_err();
        assert!(matches!(err, BelticError::Configuration(_)));
    }

    #[test]
    fn accepts_valid_signature_within_window() {
        let ts: i64 = 1_700_000_000;
        let body = b"{\"event_type\":\"credential.issued\",\"credential_id\":\"cred_x\"}";
        let sig = sign_for_test(ts, body);
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        v.verify(body, Some(&sig), Some(&ts.to_string()), ts + 5).unwrap();
    }

    #[test]
    fn rejects_signature_mismatch() {
        let ts: i64 = 1_700_000_000;
        let body = b"hello";
        let bad_sig = sign_for_test(ts, b"different body");
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        let err = v.verify(body, Some(&bad_sig), Some(&ts.to_string()), ts + 1).unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn rejects_stale_timestamp() {
        let ts: i64 = 1_700_000_000;
        let body = b"hello";
        let sig = sign_for_test(ts, body);
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        // 1 hour later — outside 300s default tolerance
        let err = v
            .verify(body, Some(&sig), Some(&ts.to_string()), ts + 3600)
            .unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn rejects_missing_timestamp_header() {
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        let err = v.verify(b"", Some("sha256=abc"), None, 0).unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn rejects_non_numeric_timestamp() {
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        let err = v
            .verify(b"", Some("sha256=abc"), Some("not-a-number"), 0)
            .unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn rejects_missing_sha256_prefix() {
        let ts: i64 = 1_700_000_000;
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        let err = v
            .verify(b"", Some("md5=abc"), Some(&ts.to_string()), ts)
            .unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn rejects_malformed_hex() {
        let ts: i64 = 1_700_000_000;
        let v = WebhookVerifier::new(SECRET.to_vec()).unwrap();
        let err = v
            .verify(b"", Some("sha256=zzz_not_hex"), Some(&ts.to_string()), ts)
            .unwrap_err();
        assert!(matches!(err, BelticError::WebhookSignature(_)));
    }

    #[test]
    fn custom_tolerance_widens_window() {
        let ts: i64 = 1_700_000_000;
        let body = b"hello";
        let sig = sign_for_test(ts, body);
        let v = WebhookVerifier::new(SECRET.to_vec())
            .unwrap()
            .with_tolerance_secs(3600);
        // 30 minutes later — outside default 300s but inside 3600s
        v.verify(body, Some(&sig), Some(&ts.to_string()), ts + 1800).unwrap();
    }
}
