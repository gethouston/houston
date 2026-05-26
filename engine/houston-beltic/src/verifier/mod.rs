//! Local JWT-VC verification.
//!
//! Beltic credentials are JWS-signed (ES256, P-256). Verifying locally is
//! sub-millisecond once the JWKS + Status List are cached, which is what we
//! want in the hot purchase path. Remote verification via
//! `POST /v1/credentials/{id}/verify` is also available (audit-friendly,
//! 50–200ms) but not implemented here; it's a one-line client call away.
//!
//! Verification steps:
//! 1. Parse JWT header → extract `kid`
//! 2. Look up matching JWK from the JWKS cache (fetched if cold) — [`jwks`]
//! 3. Verify ES256 signature via `jsonwebtoken` — [`jwks::verify_signature`]
//! 4. Check `exp`
//! 5. Check revocation against the Status List 2021 bitstring — [`status_list`]
//! 6. Evaluate `claims.permissions[]` against the transaction context — [`policy`]

mod jwks;
mod policy;
mod status_list;

use std::sync::Arc;

use jsonwebtoken::decode_header;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::Configuration;
use crate::errors::{BelticError, BelticResult};

use self::jwks::JwksCache;
use self::status_list::StatusListCache;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResult {
    pub valid: bool,
    pub reason: &'static str,
    pub credential_id: Option<String>,
    pub detail: Option<String>,
}

impl VerifyResult {
    fn ok(credential_id: Option<String>) -> Self {
        Self { valid: true, reason: "ok", credential_id, detail: None }
    }
    fn fail(reason: &'static str, detail: impl Into<String>) -> Self {
        Self { valid: false, reason, credential_id: None, detail: Some(detail.into()) }
    }
}

#[derive(Debug, Clone)]
pub struct Verifier {
    config: Configuration,
    http: reqwest::Client,
    jwks: Arc<RwLock<Option<JwksCache>>>,
    status_list: Arc<RwLock<Option<StatusListCache>>>,
}

impl Verifier {
    pub fn new(config: Configuration) -> BelticResult<Self> {
        let http = reqwest::Client::builder()
            .timeout(config.request_timeout)
            .build()
            .map_err(|e| BelticError::Configuration(format!("verifier http: {e}")))?;
        Ok(Self {
            config,
            http,
            jwks: Arc::new(RwLock::new(None)),
            status_list: Arc::new(RwLock::new(None)),
        })
    }

    /// Force-clear the JWKS cache. Call after a `kid` miss to pick up a key
    /// rotation on the next verify.
    pub async fn invalidate_jwks(&self) {
        *self.jwks.write().await = None;
    }

    /// Force-clear the Status List cache. Call after a webhook indicates a
    /// revocation so the result is seen immediately rather than at TTL expiry.
    pub async fn invalidate_status_list(&self) {
        *self.status_list.write().await = None;
    }

    pub async fn verify(&self, jwt: &str, ctx: &serde_json::Value) -> BelticResult<VerifyResult> {
        let header = decode_header(jwt).map_err(|e| BelticError::Verification {
            reason: "malformed",
            detail: format!("could not decode JWT header: {e}"),
        })?;
        let kid = header.kid.clone().ok_or_else(|| BelticError::Verification {
            reason: "malformed",
            detail: "JWT header missing kid".into(),
        })?;

        let jwk = match jwks::find_jwk(&self.jwks, &self.http, &self.config, &kid).await? {
            Some(k) => k,
            None => {
                return Ok(VerifyResult::fail("unknown_kid", format!("no JWK for kid={kid}")))
            }
        };

        let payload = match jwks::verify_signature(jwt, &jwk) {
            Ok(p) => p,
            Err(detail) => return Ok(VerifyResult::fail("bad_signature", detail)),
        };

        let cred_id = payload.get("jti").and_then(|v| v.as_str()).map(String::from);

        if let Some(exp) = payload.get("exp").and_then(|v| v.as_i64()) {
            let now = chrono::Utc::now().timestamp();
            if exp < now {
                return Ok(VerifyResult::fail("expired", format!("exp={exp} now={now}")));
            }
        }

        if let Some(detail) =
            status_list::check_revocation(&self.status_list, &self.http, &self.config, &payload).await?
        {
            return Ok(VerifyResult::fail("revoked", detail));
        }

        if let Some(detail) = policy::evaluate(&payload, ctx) {
            return Ok(VerifyResult::fail("policy_denied", detail));
        }

        Ok(VerifyResult::ok(cred_id))
    }
}
