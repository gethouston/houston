//! `did:jwk` minting per the did:jwk method spec.
//!
//! Generates an ES256 (P-256) keypair, builds the canonical public JWK,
//! base64url-encodes it, and prefixes with `did:jwk:`. The returned
//! private JWK includes `d` (the secret scalar) so callers can persist
//! it for future presentation flows (e.g., signing W3C Verifiable
//! Presentations).
//!
//! Agents in Houston don't currently present their credentials — Beltic
//! verifies by checking its own signature on the JWT-VC, the agent's
//! keypair isn't involved. We still mint a real keypair so the
//! credential is bound to a verifiable key, which keeps the door open
//! for holder binding without re-issuing every credential later.

use std::collections::BTreeMap;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use p256::{
    elliptic_curve::sec1::ToEncodedPoint,
    SecretKey,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

use crate::errors::{BelticError, BelticResult};

/// One freshly-minted agent identity. `did` matches Beltic's
/// `^did:jwk:[A-Za-z0-9_-]+$` constraint. `public_jwk` is the JWK that
/// callers can ship to Beltic (e.g., as part of agent metadata).
/// `private_jwk` is the JWK with `d` set — keep it secret; persist it
/// somewhere only the OS user can read.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintedDidJwk {
    pub did: String,
    pub public_jwk: serde_json::Value,
    pub private_jwk: serde_json::Value,
}

/// Generate a new ES256 keypair and return its `did:jwk` representation.
pub fn mint() -> BelticResult<MintedDidJwk> {
    let secret = SecretKey::random(&mut OsRng);
    let public = secret.public_key();

    // P-256 uncompressed point: [0x04, x (32 bytes), y (32 bytes)].
    let encoded = public.to_encoded_point(false);
    let x = encoded
        .x()
        .ok_or_else(|| BelticError::Configuration("p256 missing x coord".into()))?;
    let y = encoded
        .y()
        .ok_or_else(|| BelticError::Configuration("p256 missing y coord".into()))?;
    let d = secret.to_bytes();

    let x_b64 = URL_SAFE_NO_PAD.encode(x);
    let y_b64 = URL_SAFE_NO_PAD.encode(y);
    let d_b64 = URL_SAFE_NO_PAD.encode(d.as_slice());

    // Public JWK with canonical (sorted) key order so the same key
    // always produces the same did:jwk.
    let mut public_jwk_map: BTreeMap<&str, String> = BTreeMap::new();
    public_jwk_map.insert("crv", "P-256".into());
    public_jwk_map.insert("kty", "EC".into());
    public_jwk_map.insert("x", x_b64.clone());
    public_jwk_map.insert("y", y_b64.clone());

    let canonical_public = serde_json::to_string(&public_jwk_map)
        .map_err(|e| BelticError::Configuration(format!("canonicalize public jwk: {e}")))?;
    let did = format!("did:jwk:{}", URL_SAFE_NO_PAD.encode(canonical_public));

    let public_jwk = serde_json::json!({
        "kty": "EC",
        "crv": "P-256",
        "x": x_b64,
        "y": y_b64,
    });
    let private_jwk = serde_json::json!({
        "kty": "EC",
        "crv": "P-256",
        "x": x_b64,
        "y": y_b64,
        "d": d_b64,
    });

    Ok(MintedDidJwk {
        did,
        public_jwk,
        private_jwk,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mint_produces_did_with_expected_prefix() {
        let m = mint().unwrap();
        assert!(m.did.starts_with("did:jwk:"));
        // Beltic schema regex: ^did:jwk:[A-Za-z0-9_-]+$
        let suffix = &m.did["did:jwk:".len()..];
        assert!(!suffix.is_empty());
        for c in suffix.chars() {
            assert!(
                c.is_ascii_alphanumeric() || c == '_' || c == '-',
                "did suffix contains invalid char: {c}"
            );
        }
    }

    #[test]
    fn mint_produces_valid_jwk_shape() {
        let m = mint().unwrap();
        assert_eq!(m.public_jwk["kty"], "EC");
        assert_eq!(m.public_jwk["crv"], "P-256");
        // Public JWK has only x/y, not d
        assert!(m.public_jwk["x"].is_string());
        assert!(m.public_jwk["y"].is_string());
        assert!(m.public_jwk.get("d").is_none());
        // Private JWK has the secret scalar
        assert!(m.private_jwk["d"].is_string());
    }

    #[test]
    fn mint_produces_distinct_keys_each_call() {
        let a = mint().unwrap();
        let b = mint().unwrap();
        assert_ne!(a.did, b.did);
        assert_ne!(a.private_jwk["d"], b.private_jwk["d"]);
    }

    #[test]
    fn p256_coords_are_32_bytes_when_decoded() {
        let m = mint().unwrap();
        for field in ["x", "y"] {
            let s = m.public_jwk[field].as_str().unwrap();
            let bytes = URL_SAFE_NO_PAD.decode(s).unwrap();
            assert_eq!(bytes.len(), 32, "{field} should decode to 32 bytes");
        }
        let d = m.private_jwk["d"].as_str().unwrap();
        let d_bytes = URL_SAFE_NO_PAD.decode(d).unwrap();
        assert_eq!(d_bytes.len(), 32, "d should decode to 32 bytes");
    }
}
