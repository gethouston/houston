//! Shared helpers for the Beltic-backed routes (`credentials` +
//! `webhooks_beltic`). Lazy-init context (env-driven Client + Issuer +
//! Verifier) and error mapping from typed `BelticError` to `ApiError`.

use std::sync::OnceLock;

use houston_beltic::{
    BelticError, Client as BelticClient, Configuration as BelticConfig, Issuer, Verifier,
};
use houston_engine_core::CoreError;

use super::error::ApiError;

pub struct BelticContext {
    pub issuer: Issuer,
    pub verifier: Verifier,
}

/// Lazy-init the Beltic client + issuer + verifier from env vars on first
/// access. Failures cache too — surface "BELTIC_API_KEY not set" as
/// `Unavailable` so the UI can render an empty-state instead of a crash.
pub fn ctx() -> Result<&'static BelticContext, ApiError> {
    static BELTIC: OnceLock<Result<BelticContext, String>> = OnceLock::new();
    let cached = BELTIC.get_or_init(|| {
        let cfg = BelticConfig::from_env();
        if !cfg.configured() {
            return Err(
                "BELTIC_API_KEY is not set — set it in env to issue or verify credentials".into(),
            );
        }
        let client = BelticClient::new(cfg.clone()).map_err(|e| e.to_string())?;
        let verifier = Verifier::new(cfg).map_err(|e| e.to_string())?;
        Ok(BelticContext {
            issuer: Issuer::new(client),
            verifier,
        })
    });
    cached
        .as_ref()
        .map_err(|e| ApiError(CoreError::Unavailable(e.clone())))
}

/// Translate `BelticError` to `ApiError` (wraps `CoreError`). Network
/// failures and 5xx surface as `Unavailable` so retries make sense; user
/// errors (schema, attestation, delegation) surface as `BadRequest`.
pub fn map_beltic(err: BelticError) -> ApiError {
    use BelticError as B;
    let core = match err {
        B::Unauthorized(m) | B::Forbidden(m) => CoreError::BadRequest(format!("beltic auth: {m}")),
        B::NotFound(m) => CoreError::NotFound(m),
        B::SelfAttestationIncomplete(m) => {
            CoreError::BadRequest(format!("self-attestation gate: {m}"))
        }
        B::SchemaValidation(m) => CoreError::BadRequest(format!("beltic schema: {m}")),
        B::DelegationMissing => CoreError::BadRequest(
            "agent_authorization with wallet permissions requires delegated_by_subject_id (FinCEN AML)"
                .into(),
        ),
        B::Configuration(m) => CoreError::Unavailable(format!("beltic not configured: {m}")),
        B::Transport(m) => CoreError::Unavailable(format!("beltic transport: {m}")),
        B::Server { code, message } => {
            CoreError::Internal(format!("beltic upstream ({code}): {message}"))
        }
        B::Client { code, message } => {
            CoreError::BadRequest(format!("beltic ({code}): {message}"))
        }
        B::BadResponseBody(m) => CoreError::Internal(format!("beltic body: {m}")),
        B::WebhookSignature(m) => CoreError::BadRequest(format!("beltic webhook sig: {m}")),
        B::Verification { reason, detail } => {
            CoreError::BadRequest(format!("beltic verify ({reason}): {detail}"))
        }
    };
    ApiError(core)
}
