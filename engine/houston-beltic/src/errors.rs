//! Typed errors mapping Beltic's nested error envelope to local Rust types.
//!
//! Beltic's wire format (verified against `apps/api/credentials` source in
//! the Beltic platform repo): every 4xx/5xx response carries
//! `{ "error": { "code", "message", "details", "request_id" } }`. We unwrap
//! that into one of the variants below so callers can pattern-match instead
//! of grepping strings.

use thiserror::Error;

pub type BelticResult<T> = Result<T, BelticError>;

#[derive(Debug, Error)]
pub enum BelticError {
    /// API key missing or rejected. HTTP 401.
    #[error("beltic auth failed: {0}")]
    Unauthorized(String),

    /// API key lacks the required scope (e.g., `credentials:write`). HTTP 403.
    #[error("beltic forbidden: {0}")]
    Forbidden(String),

    /// Resource not found. HTTP 404.
    #[error("beltic not found: {0}")]
    NotFound(String),

    /// Self-attestation gate not satisfied. HTTP 400 + code
    /// `self_attestation_incomplete`. Do NOT retry — the caller flipped the
    /// flag without actually completing attestation, or the request is
    /// malformed.
    #[error("beltic self-attestation gate not satisfied: {0}")]
    SelfAttestationIncomplete(String),

    /// Schema validation rejected the request (Zod failure). HTTP 400 + code
    /// `validation_failed` / `malformed_request` / `missing_required_field`.
    #[error("beltic schema validation failed: {0}")]
    SchemaValidation(String),

    /// FinCEN/AML constraint — agent_authorization with wallet permissions
    /// requires `claims.delegated_by_subject_id`. We enforce client-side too.
    #[error("beltic requires delegated_by_subject_id on wallet-scoped agent permissions")]
    DelegationMissing,

    /// Generic 4xx not covered above.
    #[error("beltic client error ({code}): {message}")]
    Client { code: String, message: String },

    /// 5xx — `internal_error`, `upstream_error`, `kms_signing_failed`, etc.
    #[error("beltic server error ({code}): {message}")]
    Server { code: String, message: String },

    /// Transport-level: timeout, DNS, TLS, etc. Safe to retry.
    #[error("beltic transport error: {0}")]
    Transport(String),

    /// JSON parse failure on a response body.
    #[error("beltic response was not valid JSON: {0}")]
    BadResponseBody(String),

    /// Configuration error — typically `api_key` not set.
    #[error("beltic not configured: {0}")]
    Configuration(String),

    /// Webhook signature failed verification.
    #[error("beltic webhook signature invalid: {0}")]
    WebhookSignature(String),

    /// JWT-VC verification failed (signature, expiry, revocation, policy).
    #[error("beltic verification failed ({reason}): {detail}")]
    Verification {
        reason: &'static str,
        detail: String,
    },
}

impl BelticError {
    /// True if this error class is worth retrying with backoff (transport +
    /// 5xx). Schema / attestation / auth errors are NOT retried.
    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::Transport(_) | Self::Server { .. })
    }

    /// Build a typed error from Beltic's error envelope `{ error: { code,
    /// message, ... } }`. Falls back to a generic Client error if the code
    /// doesn't match a known taxonomy entry.
    pub fn from_envelope(http_status: u16, code: &str, message: &str) -> Self {
        match (http_status, code) {
            (401, _) => Self::Unauthorized(message.to_string()),
            (403, _) => Self::Forbidden(message.to_string()),
            (404, _) => Self::NotFound(message.to_string()),
            (_, "self_attestation_incomplete") => {
                Self::SelfAttestationIncomplete(message.to_string())
            }
            (_, "validation_failed" | "malformed_request" | "missing_required_field") => {
                Self::SchemaValidation(message.to_string())
            }
            (s, c) if (500..=599).contains(&s) => Self::Server {
                code: c.to_string(),
                message: message.to_string(),
            },
            (_, c) => Self::Client {
                code: c.to_string(),
                message: message.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_self_attestation_to_typed_variant() {
        let err = BelticError::from_envelope(400, "self_attestation_incomplete", "flag not set");
        assert!(matches!(err, BelticError::SelfAttestationIncomplete(_)));
        assert!(!err.is_retryable());
    }

    #[test]
    fn maps_5xx_to_retryable() {
        let err = BelticError::from_envelope(500, "kms_signing_failed", "kms key arn missing");
        assert!(matches!(err, BelticError::Server { .. }));
        assert!(err.is_retryable());
    }

    #[test]
    fn maps_401_to_unauthorized_regardless_of_code() {
        let err = BelticError::from_envelope(401, "unknown_code", "bad key");
        assert!(matches!(err, BelticError::Unauthorized(_)));
    }

    #[test]
    fn maps_validation_to_schema_error() {
        let err = BelticError::from_envelope(400, "validation_failed", "subject.type missing");
        assert!(matches!(err, BelticError::SchemaValidation(_)));
        assert!(!err.is_retryable());
    }
}
