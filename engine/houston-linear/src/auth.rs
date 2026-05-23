//! OAuth 2.0 install flow + token refresh — pure OAuth dance.
//!
//! Linear is a server-side OAuth app (we hold a `client_secret`) — no
//! PKCE required. The flow:
//!
//! 1. [`build_authorize_url`] builds the consent URL with `client_id`,
//!    `redirect_uri`, `state` (CSRF token), and the requested scopes.
//! 2. Browser opens the URL; user consents inside Linear.
//! 3. Linear redirects to the engine's localhost callback listener
//!    ([`crate::callback::run_callback_listener`], port
//!    [`LINEAR_OAUTH_CALLBACK_PORT`]) with `?code=...&state=...`.
//! 4. [`exchange_code`] POSTs to `LINEAR_OAUTH_TOKEN_URL` and returns
//!    the token response.
//! 5. Caller persists via [`crate::keychain::store`] and writes
//!    `connection.json` via [`crate::connection::ConnectionMeta`].
//!
//! Refresh tokens rotate on use (Linear's documented behavior).
//! [`refresh_token`] is mutex-guarded by callers — concurrent refresh
//! attempts would each invalidate the other and force re-auth.

use crate::error::LinearError;
use crate::keychain::StoredTokens;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

/// Fixed port for the Linear OAuth callback listener. The Linear OAuth
/// app config MUST include `http://localhost:19824/callback` as an
/// allowed redirect URI.
pub const LINEAR_OAUTH_CALLBACK_PORT: u16 = 19824;

/// Standard redirect URI Linear's OAuth app config should allow.
pub const LINEAR_OAUTH_REDIRECT_URI: &str = "http://localhost:19824/callback";

/// Build the Linear OAuth authorize URL.
///
/// `state` is the CSRF token the caller generated; the callback
/// handler verifies it matches before exchanging the code.
pub fn build_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    scopes: &[&str],
) -> Result<url::Url, LinearError> {
    if client_id.is_empty() {
        return Err(LinearError::Oauth("client_id is empty".into()));
    }
    let scope = scopes.join(",");
    let mut url = url::Url::parse(crate::LINEAR_OAUTH_AUTHORIZE_URL)
        .map_err(|e| LinearError::Oauth(format!("invalid LINEAR_OAUTH_AUTHORIZE_URL: {e}")))?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &scope)
        .append_pair("state", state)
        .append_pair("prompt", "consent");
    Ok(url)
}

/// Exchange an authorization `code` for an access token.
///
/// Linear's token response carries `access_token`, optional
/// `refresh_token`, `expires_in`, `scope`, `token_type`. Org / viewer
/// info is fetched separately via [`crate::queries::viewer`] for
/// type-safety.
pub async fn exchange_code(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, LinearError> {
    let resp = http
        .post(crate::LINEAR_OAUTH_TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await?;

    let status = resp.status();
    let body = resp.text().await?;

    if !status.is_success() {
        return Err(LinearError::Oauth(format!(
            "Linear token exchange returned {status}: {body}"
        )));
    }
    serde_json::from_str(&body).map_err(LinearError::Json)
}

/// Refresh an access token using a stored refresh token. Returns the
/// new tokens; caller MUST persist immediately (Linear rotates the
/// refresh token on each use; failing to persist invalidates the
/// stored copy).
///
/// Concurrency: callers MUST hold a per-connection mutex around this
/// (single in-flight refresh). Concurrent refreshes race; one becomes
/// invalid; user sees auth-required UI.
pub async fn refresh_token(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<TokenResponse, LinearError> {
    let resp = http
        .post(crate::LINEAR_OAUTH_TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await?;

    let status = resp.status();
    let body = resp.text().await?;

    if !status.is_success() {
        return Err(LinearError::Oauth(format!(
            "Linear refresh returned {status}: {body}"
        )));
    }
    serde_json::from_str(&body).map_err(LinearError::Json)
}

/// Project a fresh [`TokenResponse`] into the [`StoredTokens`] shape
/// the keychain holds. Computes `expires_at` from `expires_in`.
pub fn project_to_stored(token: &TokenResponse, webhook_secret: Option<String>) -> StoredTokens {
    let expires_at = token.expires_in.map(|exp| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() + exp)
            .unwrap_or(0)
    });
    StoredTokens {
        access_token: token.access_token.clone(),
        refresh_token: token.refresh_token.clone(),
        expires_at,
        token_type: token.token_type.clone(),
        scope: token.scope.clone(),
        webhook_secret,
    }
}

/// Token response shape from `POST /oauth/token`.
#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_includes_all_required_params() {
        let url = build_authorize_url(
            "client_id_abc",
            "http://localhost:19824/callback",
            "csrf_token_xyz",
            &["read", "write", "app:assignable"],
        )
        .unwrap();

        let s = url.as_str();
        assert!(s.starts_with("https://linear.app/oauth/authorize"));
        assert!(s.contains("response_type=code"));
        assert!(s.contains("client_id=client_id_abc"));
        assert!(s.contains("state=csrf_token_xyz"));
        assert!(s.contains("scope=read%2Cwrite%2Capp%3Aassignable"));
        assert!(s.contains("redirect_uri=http%3A%2F%2Flocalhost%3A19824%2Fcallback"));
        assert!(s.contains("prompt=consent"));
    }

    #[test]
    fn empty_client_id_rejected() {
        let err = build_authorize_url("", "http://localhost/cb", "state", &["read"]).unwrap_err();
        assert!(matches!(err, LinearError::Oauth(_)));
    }

    #[test]
    fn callback_port_matches_documented_redirect() {
        assert!(LINEAR_OAUTH_REDIRECT_URI.contains(&LINEAR_OAUTH_CALLBACK_PORT.to_string()));
    }

    #[test]
    fn project_to_stored_computes_expires_at() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let resp = TokenResponse {
            access_token: "atk".into(),
            token_type: Some("Bearer".into()),
            expires_in: Some(3600),
            refresh_token: Some("rtk".into()),
            scope: Some("read".into()),
        };
        let stored = project_to_stored(&resp, Some("whsec".into()));
        assert_eq!(stored.access_token, "atk");
        assert_eq!(stored.refresh_token.as_deref(), Some("rtk"));
        let expires = stored.expires_at.expect("expires_at populated");
        assert!(expires >= now + 3595 && expires <= now + 3605);
        assert_eq!(stored.webhook_secret.as_deref(), Some("whsec"));
    }

    #[test]
    fn project_to_stored_handles_missing_expires_in() {
        let resp = TokenResponse {
            access_token: "atk".into(),
            token_type: None,
            expires_in: None,
            refresh_token: None,
            scope: None,
        };
        let stored = project_to_stored(&resp, None);
        assert!(stored.expires_at.is_none());
        assert!(stored.refresh_token.is_none());
    }
}
