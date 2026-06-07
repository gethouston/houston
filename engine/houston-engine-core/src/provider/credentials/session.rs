//! One-time import sessions with short TTL.

use super::allowlist::CredentialProvider;
use super::crypto::{encode_public_key, generate_keypair};
use crate::error::{CoreError, CoreResult};
use chrono::{DateTime, Duration, Utc};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use x25519_dalek::StaticSecret;

const SESSION_TTL_SECS: i64 = 300;

static SESSIONS: Lazy<Mutex<HashMap<String, ImportSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

struct ImportSession {
    provider: CredentialProvider,
    secret_key: StaticSecret,
    expires_at: DateTime<Utc>,
}

pub struct ImportSessionInfo {
    pub session_id: String,
    pub public_key: String,
    pub expires_at: DateTime<Utc>,
}

#[cfg(test)]
pub(crate) fn reset_sessions_for_test() {
    SESSIONS.lock().unwrap().clear();
}

pub fn create_import_session(provider: CredentialProvider) -> CoreResult<ImportSessionInfo> {
    let (secret_key, public_key) = generate_keypair();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::seconds(SESSION_TTL_SECS);

    let mut map = SESSIONS.lock().unwrap();
    purge_expired(&mut map);
    map.insert(
        session_id.clone(),
        ImportSession {
            provider,
            secret_key,
            expires_at,
        },
    );

    Ok(ImportSessionInfo {
        session_id,
        public_key: encode_public_key(&public_key),
        expires_at,
    })
}

pub fn peek_import_session(
    session_id: &str,
    provider: CredentialProvider,
) -> CoreResult<StaticSecret> {
    let mut map = SESSIONS.lock().unwrap();
    purge_expired(&mut map);

    let session = map.get(session_id).ok_or_else(|| {
        CoreError::BadRequest("import session not found or expired".into())
    })?;

    if session.provider != provider {
        return Err(CoreError::BadRequest(
            "import session provider does not match request".into(),
        ));
    }
    if session.expires_at <= Utc::now() {
        return Err(CoreError::BadRequest("import session expired".into()));
    }

    Ok(session.secret_key.clone())
}

pub fn remove_import_session(session_id: &str) {
    let mut map = SESSIONS.lock().unwrap();
    map.remove(session_id);
}

pub fn take_import_session(
    session_id: &str,
    provider: CredentialProvider,
) -> CoreResult<StaticSecret> {
    let secret = peek_import_session(session_id, provider)?;
    remove_import_session(session_id);
    Ok(secret)
}

fn purge_expired(map: &mut HashMap<String, ImportSession>) {
    let now = Utc::now();
    map.retain(|_, s| s.expires_at > now);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_single_use() {
        reset_sessions_for_test();
        let info = create_import_session(CredentialProvider::OpenAi).unwrap();
        let secret = peek_import_session(&info.session_id, CredentialProvider::OpenAi).unwrap();
        assert_eq!(secret.as_bytes().len(), 32);
        peek_import_session(&info.session_id, CredentialProvider::OpenAi).unwrap();
        remove_import_session(&info.session_id);
        assert!(peek_import_session(&info.session_id, CredentialProvider::OpenAi).is_err());
        let info2 = create_import_session(CredentialProvider::OpenAi).unwrap();
        take_import_session(&info2.session_id, CredentialProvider::OpenAi).unwrap();
        assert!(take_import_session(&info2.session_id, CredentialProvider::OpenAi).is_err());
    }
}
