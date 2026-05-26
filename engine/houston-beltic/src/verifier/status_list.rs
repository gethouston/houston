//! Status List 2021 bitstring fetch + bit lookup.
//!
//! Beltic publishes revocations via a W3C Status List 2021 credential at
//! `<base>/.well-known/status-lists/v1`. The payload's
//! `credentialSubject.encodedList` is gzip-then-base64url; bit at
//! `statusListIndex` is 1 if the credential is revoked.

use std::io::Read;
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use flate2::read::GzDecoder;
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::config::Configuration;
use crate::errors::{BelticError, BelticResult};

const DEFAULT_TTL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
pub struct StatusListCache {
    pub bits: Vec<u8>,
    pub fetched_at: Instant,
    pub ttl: Duration,
}

#[derive(Debug, Deserialize)]
struct StatusListResponse {
    #[serde(rename = "credentialSubject")]
    credential_subject: StatusListSubject,
}

#[derive(Debug, Deserialize)]
struct StatusListSubject {
    #[serde(rename = "encodedList")]
    encoded_list: String,
}

/// If the JWT-VC payload references a `credentialStatus`, check the bit and
/// return `Some(detail)` if revoked (so the caller can build a `VerifyResult`).
/// Returns `None` if not revoked OR if the credential has no
/// `credentialStatus` entry.
pub async fn check_revocation(
    cache: &Arc<RwLock<Option<StatusListCache>>>,
    http: &reqwest::Client,
    config: &Configuration,
    payload: &serde_json::Value,
) -> BelticResult<Option<String>> {
    let status = payload
        .pointer("/vc/credentialStatus")
        .or_else(|| payload.get("credentialStatus"));
    let Some(status) = status else { return Ok(None) };
    let index = status
        .get("statusListIndex")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| BelticError::Verification {
            reason: "malformed",
            detail: "credentialStatus.statusListIndex missing or non-numeric".into(),
        })?;
    let bits = fetch(cache, http, config).await?;
    if bit_is_set(&bits, index as usize) {
        Ok(Some(format!("statusListIndex={index} bit=1")))
    } else {
        Ok(None)
    }
}

async fn fetch(
    cache: &Arc<RwLock<Option<StatusListCache>>>,
    http: &reqwest::Client,
    config: &Configuration,
) -> BelticResult<Vec<u8>> {
    {
        let guard = cache.read().await;
        if let Some(entry) = guard.as_ref() {
            if entry.fetched_at.elapsed() <= entry.ttl {
                return Ok(entry.bits.clone());
            }
        }
    }
    let url = config.status_list_url()?;
    let response = http
        .get(&url)
        .send()
        .await
        .map_err(|e| BelticError::Transport(format!("status list fetch: {e}")))?;
    let ttl = super::jwks::parse_cache_control_max_age(&response).unwrap_or(DEFAULT_TTL);
    let body: StatusListResponse = response
        .json()
        .await
        .map_err(|e| BelticError::BadResponseBody(format!("status list decode: {e}")))?;
    let bits = decode_encoded_list(&body.credential_subject.encoded_list)?;
    *cache.write().await = Some(StatusListCache {
        bits: bits.clone(),
        fetched_at: Instant::now(),
        ttl,
    });
    Ok(bits)
}

fn bit_is_set(bytes: &[u8], index: usize) -> bool {
    let byte_index = index / 8;
    let bit_in_byte = 7 - (index % 8);
    bytes
        .get(byte_index)
        .map(|b| (b >> bit_in_byte) & 1 == 1)
        .unwrap_or(false)
}

fn decode_encoded_list(encoded: &str) -> BelticResult<Vec<u8>> {
    let gz = URL_SAFE_NO_PAD
        .decode(encoded.trim_end_matches('='))
        .map_err(|e| BelticError::BadResponseBody(format!("status list base64: {e}")))?;
    let mut out = Vec::new();
    GzDecoder::new(gz.as_slice())
        .read_to_end(&mut out)
        .map_err(|e| BelticError::BadResponseBody(format!("status list gunzip: {e}")))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bit_lookup_msb_first() {
        assert!(bit_is_set(&[0b1000_0000], 0));
        assert!(!bit_is_set(&[0b1000_0000], 1));
        assert!(bit_is_set(&[0b0000_0001], 7));
        // Past end of bytes → false, no panic
        assert!(!bit_is_set(&[0], 999));
    }

    #[test]
    fn decode_encoded_list_round_trips() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut bits = vec![0u8; 16];
        bits[0] = 0b0000_0100;
        let mut enc = GzEncoder::new(Vec::new(), Compression::default());
        enc.write_all(&bits).unwrap();
        let gz = enc.finish().unwrap();
        let encoded = URL_SAFE_NO_PAD.encode(&gz);
        let decoded = decode_encoded_list(&encoded).unwrap();
        assert_eq!(decoded, bits);
        assert!(bit_is_set(&decoded, 5));
    }
}
