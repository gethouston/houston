//! X25519 + ChaCha20-Poly1305 encryption for credential bundles.

use crate::error::{CoreError, CoreResult};
use base64::Engine as _;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand::RngCore;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

const KDF_CONTEXT: &[u8] = b"houston-credential-sync-v1\0";

/// Wire ciphertext envelope (base64-encoded fields).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialCiphertext {
    pub version: u8,
    pub ephemeral_public_key: String,
    pub nonce: String,
    pub ciphertext: String,
}

pub fn encode_public_key(pk: &PublicKey) -> String {
    base64::engine::general_purpose::STANDARD.encode(pk.as_bytes())
}

pub fn decode_public_key(encoded: &str) -> CoreResult<PublicKey> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| CoreError::BadRequest(format!("invalid publicKey encoding: {e}")))?;
    let arr: [u8; 32] = bytes.as_slice().try_into().map_err(|_| {
        CoreError::BadRequest("publicKey must be 32 bytes when decoded".into())
    })?;
    Ok(PublicKey::from(arr))
}

pub fn generate_keypair() -> (StaticSecret, PublicKey) {
    let secret = StaticSecret::random_from_rng(rand::thread_rng());
    let public = PublicKey::from(&secret);
    (secret, public)
}

pub fn encrypt_for_recipient(
    recipient_public: &PublicKey,
    session_id: &str,
    plaintext: &[u8],
) -> CoreResult<CredentialCiphertext> {
    let ephemeral_secret = StaticSecret::random_from_rng(rand::thread_rng());
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let shared = ephemeral_secret.diffie_hellman(recipient_public);
    let key = derive_symmetric_key(shared.as_bytes(), session_id);
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CoreError::Internal(format!("cipher init failed: {e}")))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher.encrypt(&nonce, plaintext).map_err(|e| {
        CoreError::Internal(format!("credential encryption failed: {e}"))
    })?;

    Ok(CredentialCiphertext {
        version: 1,
        ephemeral_public_key: encode_public_key(&ephemeral_public),
        nonce: base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

pub fn decrypt_from_sender(
    recipient_secret: &StaticSecret,
    session_id: &str,
    envelope: &CredentialCiphertext,
) -> CoreResult<Vec<u8>> {
    if envelope.version != 1 {
        return Err(CoreError::BadRequest(format!(
            "unsupported credential ciphertext version {}",
            envelope.version
        )));
    }
    let ephemeral_public = decode_public_key(&envelope.ephemeral_public_key)?;
    let shared = recipient_secret.diffie_hellman(&ephemeral_public);
    let key = derive_symmetric_key(shared.as_bytes(), session_id);
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CoreError::Internal(format!("cipher init failed: {e}")))?;

    let nonce_bytes = base64::engine::general_purpose::STANDARD
        .decode(envelope.nonce.as_str())
        .map_err(|e| CoreError::BadRequest(format!("invalid nonce encoding: {e}")))?;
    let nonce_arr: [u8; 12] = nonce_bytes.as_slice().try_into().map_err(|_| {
        CoreError::BadRequest("nonce must be 12 bytes when decoded".into())
    })?;
    let nonce = Nonce::from(nonce_arr);
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(envelope.ciphertext.as_str())
        .map_err(|e| CoreError::BadRequest(format!("invalid ciphertext encoding: {e}")))?;

    cipher
        .decrypt(&nonce, ciphertext.as_ref())
        .map_err(|_| CoreError::BadRequest("credential decryption failed".into()))
}

fn derive_symmetric_key(shared_secret: &[u8; 32], session_id: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(KDF_CONTEXT);
    h.update(shared_secret);
    h.update(session_id.as_bytes());
    h.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_encrypt_decrypt() {
        let (secret, public) = generate_keypair();
        let session_id = "sess-123";
        let plaintext = br#"{"provider":"openai"}"#;
        let envelope = encrypt_for_recipient(&public, session_id, plaintext).unwrap();
        let decrypted = decrypt_from_sender(&secret, session_id, &envelope).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_session_id_fails_decrypt() {
        let (secret, public) = generate_keypair();
        let envelope = encrypt_for_recipient(&public, "a", b"secret").unwrap();
        assert!(decrypt_from_sender(&secret, "b", &envelope).is_err());
    }
}
