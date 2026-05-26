//! JWKS cache + ES256 signature verification.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::config::Configuration;
use crate::errors::{BelticError, BelticResult};

const DEFAULT_TTL: Duration = Duration::from_secs(3_600);

#[derive(Debug, Clone)]
pub struct JwksCache {
    pub keys: HashMap<String, Jwk>,
    pub fetched_at: Instant,
    pub ttl: Duration,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Jwk {
    pub kid: String,
    #[serde(default)]
    pub alg: Option<String>,
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
}

#[derive(Debug, Deserialize)]
struct JwksResponse {
    keys: Vec<Jwk>,
}

pub async fn find_jwk(
    cache: &Arc<RwLock<Option<JwksCache>>>,
    http: &reqwest::Client,
    config: &Configuration,
    kid: &str,
) -> BelticResult<Option<Jwk>> {
    if let Some(jwk) = lookup_cached(cache, kid).await {
        return Ok(Some(jwk));
    }
    refresh(cache, http, config).await?;
    Ok(lookup_cached(cache, kid).await)
}

async fn lookup_cached(cache: &Arc<RwLock<Option<JwksCache>>>, kid: &str) -> Option<Jwk> {
    let guard = cache.read().await;
    let entry = guard.as_ref()?;
    if entry.fetched_at.elapsed() > entry.ttl {
        return None;
    }
    entry.keys.get(kid).cloned()
}

async fn refresh(
    cache: &Arc<RwLock<Option<JwksCache>>>,
    http: &reqwest::Client,
    config: &Configuration,
) -> BelticResult<()> {
    let url = config.jwks_url()?;
    let response = http
        .get(&url)
        .send()
        .await
        .map_err(|e| BelticError::Transport(format!("jwks fetch: {e}")))?;
    let ttl = parse_cache_control_max_age(&response).unwrap_or(DEFAULT_TTL);
    let body: JwksResponse = response
        .json()
        .await
        .map_err(|e| BelticError::BadResponseBody(format!("jwks decode: {e}")))?;
    let keys = body.keys.into_iter().map(|k| (k.kid.clone(), k)).collect();
    *cache.write().await = Some(JwksCache {
        keys,
        fetched_at: Instant::now(),
        ttl,
    });
    Ok(())
}

/// Verify the JWT-VC signature using the supplied JWK. Returns the decoded
/// payload (claims) on success. Treats Beltic's V1 cipher (ES256 / P-256) as
/// the only acceptable algorithm.
///
/// Errors are returned as `String` so the caller can choose how to surface
/// them — `BelticError::Verification` for transport-level failures vs.
/// `VerifyResult::fail("bad_signature", ...)` for credential-level rejections.
pub fn verify_signature(jwt: &str, jwk: &Jwk) -> Result<serde_json::Value, String> {
    if jwk.kty != "EC" || jwk.crv != "P-256" {
        return Err(format!("unsupported kty/crv: {}/{}", jwk.kty, jwk.crv));
    }
    let alg = match jwk.alg.as_deref() {
        Some("ES256") | None => Algorithm::ES256,
        Some(other) => return Err(format!("unsupported alg: {other}")),
    };
    let key = DecodingKey::from_ec_components(&jwk.x, &jwk.y)
        .map_err(|e| format!("could not build decoding key: {e}"))?;
    let mut validation = Validation::new(alg);
    // We do expiry + audience checks ourselves so we control the reason strings.
    validation.validate_exp = false;
    validation.required_spec_claims = std::collections::HashSet::new();
    let data = decode::<serde_json::Value>(jwt, &key, &validation)
        .map_err(|e| format!("signature verification failed: {e}"))?;
    Ok(data.claims)
}

pub(super) fn parse_cache_control_max_age(response: &reqwest::Response) -> Option<Duration> {
    response
        .headers()
        .get("cache-control")
        .and_then(|v| v.to_str().ok())
        .and_then(|cc| {
            cc.split(',').find_map(|part| {
                part.trim()
                    .strip_prefix("max-age=")
                    .and_then(|n| n.parse::<u64>().ok())
            })
        })
        .map(Duration::from_secs)
}
