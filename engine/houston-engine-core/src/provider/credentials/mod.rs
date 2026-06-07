//! Provider credential export/import with end-to-end encryption.
//!
//! Cloud engine creates a one-time import session (X25519 keypair).
//! Local engine reads allowlisted credential files, encrypts the bundle
//! for the session public key. Cloud engine decrypts, validates paths,
//! writes files with owner-only permissions, and probes provider status.

mod allowlist;
mod anthropic_keychain;
mod composio_keyring;
mod bundle;
mod crypto;
mod session;

pub use allowlist::CredentialProvider;
pub use bundle::{CredentialAuthKind, CredentialFileEntry, ProviderCredentialBundle};
pub use crypto::{CredentialCiphertext, decode_public_key, encrypt_for_recipient};
pub use session::create_import_session;

use crate::error::{CoreError, CoreResult};
use crate::provider::{self, ProviderStatus};
use base64::Engine as _;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::Path;

/// Response from `POST /v1/providers/:name/credential-import/session`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialImportSessionResponse {
    pub session_id: String,
    pub public_key: String,
    pub expires_at: String,
}

/// Request body for `POST /v1/providers/:name/credential-export`.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialExportRequest {
    pub session_id: String,
    pub public_key: String,
}

/// Response from `POST /v1/providers/:name/credential-export`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialExportResponse {
    pub provider: String,
    pub session_id: String,
    pub ciphertext: CredentialCiphertext,
}

/// Request body for `POST /v1/providers/:name/credential-import`.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialImportRequest {
    pub session_id: String,
    pub ciphertext: CredentialCiphertext,
}

/// Response from `POST /v1/providers/:name/credential-import`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialImportResponse {
    pub provider: String,
    pub auth_state: String,
    pub files_written: usize,
}

pub fn start_import_session(provider_name: &str) -> CoreResult<CredentialImportSessionResponse> {
    let provider = CredentialProvider::parse(provider_name)?;
    let info = session::create_import_session(provider)?;
    Ok(CredentialImportSessionResponse {
        session_id: info.session_id,
        public_key: info.public_key,
        expires_at: info.expires_at.to_rfc3339(),
    })
}

pub async fn export_credentials(
    provider_name: &str,
    req: &CredentialExportRequest,
) -> CoreResult<CredentialExportResponse> {
    let provider = CredentialProvider::parse(provider_name)?;
    if req.session_id.trim().is_empty() {
        return Err(CoreError::BadRequest("sessionId is required".into()));
    }
    let recipient = decode_public_key(&req.public_key)?;
    let files = read_allowlisted_files(provider).await?;
    let bundle = bundle::build_bundle(provider, files)?;
    let plaintext = serde_json::to_vec(&bundle)
        .map_err(|e| CoreError::Internal(format!("failed to serialize credential bundle: {e}")))?;
    let ciphertext =
        crypto::encrypt_for_recipient(&recipient, &req.session_id, &plaintext)?;
    tracing::info!(
        "[credential-sync] exported {} file(s) for provider '{}'",
        bundle.files.len(),
        provider.id()
    );
    Ok(CredentialExportResponse {
        provider: provider.id().to_string(),
        session_id: req.session_id.clone(),
        ciphertext,
    })
}

pub async fn import_credentials(
    provider_name: &str,
    req: &CredentialImportRequest,
    sink: DynEventSink,
) -> CoreResult<CredentialImportResponse> {
    let provider = CredentialProvider::parse(provider_name)?;
    if req.session_id.trim().is_empty() {
        return Err(CoreError::BadRequest("sessionId is required".into()));
    }
    let secret = session::peek_import_session(&req.session_id, provider)?;
    let plaintext =
        crypto::decrypt_from_sender(&secret, &req.session_id, &req.ciphertext)?;
    let bundle: ProviderCredentialBundle = serde_json::from_slice(&plaintext).map_err(|e| {
        CoreError::BadRequest(format!("invalid credential bundle payload: {e}"))
    })?;
    bundle::validate_bundle(provider, &bundle)?;
    session::remove_import_session(&req.session_id);
    let files_written = write_bundle_files(provider, &bundle).await?;
    let auth_state = probe_auth_state(provider).await?;
    sink.emit(HoustonEvent::ProviderCredentialsSynced {
        provider: provider.id().to_string(),
        auth_state: auth_state.clone(),
        files_written,
    });
    tracing::info!(
        "[credential-sync] imported {} file(s) for provider '{}'",
        files_written,
        provider.id()
    );
    Ok(CredentialImportResponse {
        provider: provider.id().to_string(),
        auth_state,
        files_written,
    })
}

async fn read_allowlisted_files(
    provider: CredentialProvider,
) -> CoreResult<Vec<CredentialFileEntry>> {
    let mut files = Vec::new();
    for rel in provider.allowed_rel_paths() {
        if provider == CredentialProvider::Composio
            && *rel == composio_keyring::user_data_rel_path()
        {
            if let Some(b) = composio_keyring::export_user_data_bytes() {
                let content = String::from_utf8(b.clone()).map_err(|e| {
                    CoreError::BadRequest(format!("composio user_data.json must be UTF-8: {e}"))
                })?;
                allowlist::validate_composio_user_data(&content)?;
                files.push(CredentialFileEntry {
                    rel_path: rel.to_string(),
                    mode: provider.default_file_mode(rel),
                    contents: base64::engine::general_purpose::STANDARD.encode(&b),
                });
                continue;
            }
        }
        let path = allowlist::home_join(rel)?;
        let bytes = match tokio::fs::read(&path).await {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if provider == CredentialProvider::Anthropic
                    && *rel == anthropic_keychain::credentials_rel_path()
                {
                    if let Some(b) = anthropic_keychain::claude_oauth_credentials_bytes() {
                        files.push(CredentialFileEntry {
                            rel_path: rel.to_string(),
                            mode: provider.default_file_mode(rel),
                            contents: base64::engine::general_purpose::STANDARD.encode(&b),
                        });
                        continue;
                    }
                }
                match read_legacy_fallback(provider, rel).await? {
                    Some(b) => b,
                    None => continue,
                }
            }
            Err(e) => {
                return Err(CoreError::Internal(format!(
                    "failed to read {}: {e}",
                    path.display()
                )));
            }
        };
        if provider == CredentialProvider::Composio {
            let content = String::from_utf8(bytes.clone()).map_err(|e| {
                CoreError::BadRequest(format!("composio user_data.json must be UTF-8: {e}"))
            })?;
            allowlist::validate_composio_user_data(&content)?;
        }
        files.push(CredentialFileEntry {
            rel_path: rel.to_string(),
            mode: provider.default_file_mode(rel),
            contents: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Ok(files)
}

/// Legacy Houston env paths (pre-`providers/` layout) are readable for status
/// probes but not on the export allowlist. When only legacy exists, export it
/// under the canonical allowlisted rel path so cloud import writes the new shape.
async fn read_legacy_fallback(
    provider: CredentialProvider,
    canonical_rel: &str,
) -> CoreResult<Option<Vec<u8>>> {
    if !canonical_rel.ends_with("/.env") {
        return Ok(None);
    }
    let legacy_rel = match provider {
        CredentialProvider::OpenRouter if canonical_rel == ".houston/providers/openrouter/.env" => {
            ".houston/openrouter/.env"
        }
        CredentialProvider::OpenAi if canonical_rel == ".houston/providers/openai/.env" => {
            ".houston/openai/.env"
        }
        CredentialProvider::Anthropic if canonical_rel == ".houston/providers/anthropic/.env" => {
            ".houston/anthropic/.env"
        }
        _ => return Ok(None),
    };
    let legacy_path = allowlist::home_join(legacy_rel)?;
    match tokio::fs::read(&legacy_path).await {
        Ok(b) if !b.is_empty() => Ok(Some(b)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(CoreError::Internal(format!(
            "failed to read legacy {}: {e}",
            legacy_path.display()
        ))),
    }
}

async fn write_bundle_files(
    provider: CredentialProvider,
    bundle: &ProviderCredentialBundle,
) -> CoreResult<usize> {
    let mut written = 0usize;
    for file in &bundle.files {
        let rel = allowlist::validate_rel_path(provider, &file.rel_path)?;
        let dest = allowlist::home_join(&rel)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.contents.as_str())
            .map_err(|e| CoreError::BadRequest(format!("invalid file contents encoding: {e}")))?;
        write_file_with_mode(&dest, &bytes, file.mode).await?;
        written += 1;
    }
    Ok(written)
}

async fn write_file_with_mode(path: &Path, bytes: &[u8], _mode: u32) -> CoreResult<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            CoreError::Internal(format!("failed to create {}: {e}", parent.display()))
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let dir_mode = std::fs::Permissions::from_mode(0o700);
            let _ = std::fs::set_permissions(parent, dir_mode);
        }
    }
    super::provider_env_store::write_atomic(path, bytes).await
}

async fn probe_auth_state(provider: CredentialProvider) -> CoreResult<String> {
    match provider {
        CredentialProvider::Composio => {
            let path = allowlist::home_join(".composio/user_data.json")?;
            let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
                CoreError::Internal(format!("composio status probe failed: {e}"))
            })?;
            allowlist::validate_composio_user_data(&content)?;
            Ok("authenticated".into())
        }
        _ => {
            let p = provider::parse(provider.id())?;
            let status: ProviderStatus = provider::check_status(p).await?;
            Ok(serde_json::to_value(status.auth_state)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_else(|| "unknown".into()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use tempfile::TempDir;

    async fn with_home<F: std::future::Future<Output = ()>>(f: F) {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior = std::env::var_os("HOME");
        // Pin the Houston data root to `$HOME/.houston` so it matches the
        // `home.join(".houston/...")` paths these tests write. Without this,
        // `houston_data_root()` resolves to `$HOME/.dev-houston` under
        // `debug_assertions` and the `.houston/`-prefixed export paths miss.
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path().join(".houston"));
        f.await;
        match prior {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_houston {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
    }

    #[tokio::test]
    async fn export_import_round_trip_anthropic() {
        session::reset_sessions_for_test();
        with_home(async {
            let home = dirs::home_dir().unwrap();
            let creds_path = home.join(".claude/.credentials.json");
            std::fs::create_dir_all(creds_path.parent().unwrap()).unwrap();
            std::fs::write(
                &creds_path,
                r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-export","refreshToken":"r","expiresAt":1}}"#,
            )
            .unwrap();

            let session = start_import_session("anthropic").unwrap();
            let export = export_credentials(
                "anthropic",
                &CredentialExportRequest {
                    session_id: session.session_id.clone(),
                    public_key: session.public_key.clone(),
                },
            )
            .await
            .unwrap();
            assert_eq!(export.provider, "anthropic");

            std::fs::remove_file(&creds_path).unwrap();
            assert!(!creds_path.exists());

            let sink = std::sync::Arc::new(houston_ui_events::NoopEventSink);
            let import = import_credentials(
                "anthropic",
                &CredentialImportRequest {
                    session_id: session.session_id,
                    ciphertext: export.ciphertext,
                },
                sink,
            )
            .await
            .unwrap();
            assert_eq!(import.files_written, 1);
            assert!(creds_path.exists());
        })
        .await;
    }

    #[tokio::test]
    async fn export_import_round_trip_openai() {
        session::reset_sessions_for_test();
        with_home(async {
            let home = dirs::home_dir().unwrap();
            let auth_path = home.join(".codex/auth.json");
            std::fs::create_dir_all(auth_path.parent().unwrap()).unwrap();
            std::fs::write(&auth_path, r#"{"tokens":{"access":"x"}}"#).unwrap();

            let session = start_import_session("openai").unwrap();
            let export = export_credentials(
                "openai",
                &CredentialExportRequest {
                    session_id: session.session_id.clone(),
                    public_key: session.public_key.clone(),
                },
            )
            .await
            .unwrap();
            assert!(!export.ciphertext.ciphertext.is_empty());

            std::fs::remove_file(&auth_path).unwrap();
            assert!(!auth_path.exists());

            let sink = std::sync::Arc::new(houston_ui_events::NoopEventSink);
            let import = import_credentials(
                "openai",
                &CredentialImportRequest {
                    session_id: session.session_id,
                    ciphertext: export.ciphertext,
                },
                sink,
            )
            .await
            .unwrap();
            assert_eq!(import.files_written, 1);
            assert!(auth_path.exists());
        })
        .await;
    }

    #[tokio::test]
    async fn export_reads_openrouter_legacy_env_path() {
        session::reset_sessions_for_test();
        with_home(async {
            let home = dirs::home_dir().unwrap();
            let legacy = home.join(".houston/openrouter/.env");
            std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
            std::fs::write(&legacy, "OPENROUTER_API_KEY=sk-or-v1-testkey1234567890\n").unwrap();

            let session = start_import_session("openrouter").unwrap();
            let export = export_credentials(
                "openrouter",
                &CredentialExportRequest {
                    session_id: session.session_id.clone(),
                    public_key: session.public_key.clone(),
                },
            )
            .await
            .unwrap();

            let secret = session::take_import_session(&session.session_id, CredentialProvider::OpenRouter).unwrap();
            let plaintext = crypto::decrypt_from_sender(&secret, &session.session_id, &export.ciphertext).unwrap();
            let bundle: ProviderCredentialBundle = serde_json::from_slice(&plaintext).unwrap();
            assert_eq!(bundle.files.len(), 1);
            assert_eq!(
                bundle.files[0].rel_path,
                ".houston/providers/openrouter/.env"
            );
        })
        .await;
    }

    #[tokio::test]
    async fn export_reads_openrouter_from_houston_data_root() {
        // Regression: the canonical key lives under the Houston data root
        // (`HOUSTON_HOME` / `~/.dev-houston` in dev), not the raw home dir.
        // Export must resolve `.houston/providers/<p>/.env` against the data
        // root or cloud credential sync fails with "no exportable credentials".
        session::reset_sessions_for_test();
        with_home(async {
            let data_root = houston_terminal_manager::houston_data_root::houston_data_root();
            let env_path = data_root.join("providers/openrouter/.env");
            std::fs::create_dir_all(env_path.parent().unwrap()).unwrap();
            std::fs::write(&env_path, "OPENROUTER_API_KEY=sk-or-v1-testkey1234567890\n").unwrap();

            let session = start_import_session("openrouter").unwrap();
            let export = export_credentials(
                "openrouter",
                &CredentialExportRequest {
                    session_id: session.session_id.clone(),
                    public_key: session.public_key.clone(),
                },
            )
            .await
            .unwrap();

            let secret = session::take_import_session(
                &session.session_id,
                CredentialProvider::OpenRouter,
            )
            .unwrap();
            let plaintext =
                crypto::decrypt_from_sender(&secret, &session.session_id, &export.ciphertext)
                    .unwrap();
            let bundle: ProviderCredentialBundle =
                serde_json::from_slice(&plaintext).unwrap();
            assert_eq!(bundle.files.len(), 1);
            assert_eq!(bundle.files[0].rel_path, ".houston/providers/openrouter/.env");
        })
        .await;
    }

    #[tokio::test]
    async fn import_rejects_reused_session() {
        session::reset_sessions_for_test();
        with_home(async {
            let home = dirs::home_dir().unwrap();
            let auth_path = home.join(".codex/auth.json");
            std::fs::create_dir_all(auth_path.parent().unwrap()).unwrap();
            std::fs::write(&auth_path, r#"{"tokens":{"access":"x"}}"#).unwrap();

            let session = start_import_session("openai").unwrap();
            let export = export_credentials(
                "openai",
                &CredentialExportRequest {
                    session_id: session.session_id.clone(),
                    public_key: session.public_key,
                },
            )
            .await
            .unwrap();
            let sink = std::sync::Arc::new(houston_ui_events::NoopEventSink);
            import_credentials(
                "openai",
                &CredentialImportRequest {
                    session_id: export.session_id.clone(),
                    ciphertext: export.ciphertext.clone(),
                },
                sink.clone(),
            )
            .await
            .unwrap();
            let err = import_credentials(
                "openai",
                &CredentialImportRequest {
                    session_id: export.session_id,
                    ciphertext: export.ciphertext,
                },
                sink,
            )
            .await
            .unwrap_err();
            assert!(matches!(err, CoreError::BadRequest(_)));
        })
        .await;
    }
}
