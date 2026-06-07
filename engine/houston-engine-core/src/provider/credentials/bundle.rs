//! Plaintext credential bundle (encrypted on the wire).

use super::allowlist::{self, CredentialProvider};
use crate::error::{CoreError, CoreResult};
use base64::Engine as _;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CredentialAuthKind {
    Oauth,
    ApiKey,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialFileEntry {
    pub rel_path: String,
    pub mode: u32,
    /// Base64-encoded file bytes.
    pub contents: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentialBundle {
    pub provider: String,
    pub auth_kind: CredentialAuthKind,
    pub files: Vec<CredentialFileEntry>,
    pub checksum: String,
    pub created_at: String,
    pub expires_at: String,
}

const BUNDLE_TTL_SECS: i64 = 300;

pub fn build_bundle(
    provider: CredentialProvider,
    files: Vec<CredentialFileEntry>,
) -> CoreResult<ProviderCredentialBundle> {
    if files.is_empty() {
        return Err(CoreError::BadRequest(format!(
            "no exportable credentials found for provider '{}'",
            provider.id()
        )));
    }
    let auth_kind = infer_auth_kind(provider, &files);
    let checksum = checksum_files(&files);
    let now = Utc::now();
    let expires_at = now + Duration::seconds(BUNDLE_TTL_SECS);
    Ok(ProviderCredentialBundle {
        provider: provider.id().to_string(),
        auth_kind,
        files,
        checksum,
        created_at: now.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    })
}

pub fn validate_bundle(
    provider: CredentialProvider,
    bundle: &ProviderCredentialBundle,
) -> CoreResult<()> {
    if bundle.provider != provider.id() {
        return Err(CoreError::BadRequest(
            "bundle provider does not match request".into(),
        ));
    }
    let expires_at = chrono::DateTime::parse_from_rfc3339(&bundle.expires_at)
        .map_err(|e| CoreError::BadRequest(format!("invalid bundle expiresAt: {e}")))?;
    if expires_at < Utc::now() {
        return Err(CoreError::BadRequest("credential bundle expired".into()));
    }
    if bundle.checksum != checksum_files(&bundle.files) {
        return Err(CoreError::BadRequest("credential bundle checksum mismatch".into()));
    }
    for file in &bundle.files {
        let rel = allowlist::validate_rel_path(provider, &file.rel_path)?;
        if provider == CredentialProvider::Composio && rel == ".composio/user_data.json" {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(file.contents.as_str())
            .map_err(|e| CoreError::BadRequest(format!("invalid file contents encoding: {e}")))?;
            let content = String::from_utf8(bytes).map_err(|e| {
                CoreError::BadRequest(format!("composio user_data.json must be UTF-8: {e}"))
            })?;
            allowlist::validate_composio_user_data(&content)?;
        }
    }
    Ok(())
}

fn infer_auth_kind(
    provider: CredentialProvider,
    files: &[CredentialFileEntry],
) -> CredentialAuthKind {
    let mut has_oauth = false;
    let mut has_api_key = false;
    for file in files {
        if file.rel_path.ends_with(".env") {
            has_api_key = true;
        } else {
            has_oauth = true;
        }
    }
    match (has_oauth, has_api_key) {
        (true, true) => CredentialAuthKind::Mixed,
        (true, false) => CredentialAuthKind::Oauth,
        (false, true) => CredentialAuthKind::ApiKey,
        (false, false) => {
            if provider == CredentialProvider::Composio {
                CredentialAuthKind::ApiKey
            } else {
                CredentialAuthKind::Oauth
            }
        }
    }
}

fn checksum_files(files: &[CredentialFileEntry]) -> String {
    let mut h = Sha256::new();
    for file in files {
        h.update(file.rel_path.as_bytes());
        h.update(file.contents.as_bytes());
        h.update(file.mode.to_le_bytes());
    }
    hex::encode(h.finalize())
}

mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_is_stable() {
        let files = vec![CredentialFileEntry {
            rel_path: ".codex/auth.json".into(),
            mode: 0o600,
            contents: base64::engine::general_purpose::STANDARD.encode(b"{}"),
        }];
        let c1 = checksum_files(&files);
        let c2 = checksum_files(&files);
        assert_eq!(c1, c2);
    }
}
