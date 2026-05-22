//! Runtime configuration for the Beltic client.
//!
//! Constructed from ENV at process start in `houston-engine-server`. The
//! `jwks_url` and `status_list_url` defaults are derived from `base_url`,
//! so pointing the integration at a local Beltic platform via
//! `BELTIC_BASE_URL=http://localhost:8080/v1` just works — no need to
//! override the well-known URLs separately.

use std::time::Duration;

use url::Url;

use crate::errors::{BelticError, BelticResult};

pub const DEFAULT_BASE_URL: &str = "https://api.beltic.com/v1";
pub const DEFAULT_ISSUER_DID: &str = "did:web:beltic.com";
const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 10;
const DEFAULT_OPEN_TIMEOUT_SECS: u64 = 5;

#[derive(Debug, Clone)]
pub struct Configuration {
    pub api_key: Option<String>,
    pub base_url: String,
    pub webhook_secret: Option<String>,
    pub org_credential_id: Option<String>,
    pub org_subject_id: Option<String>,
    pub issuer_did: String,
    pub jwks_url_override: Option<String>,
    pub status_list_url_override: Option<String>,
    pub request_timeout: Duration,
    pub open_timeout: Duration,
}

impl Default for Configuration {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: DEFAULT_BASE_URL.to_string(),
            webhook_secret: None,
            org_credential_id: None,
            org_subject_id: None,
            issuer_did: DEFAULT_ISSUER_DID.to_string(),
            jwks_url_override: None,
            status_list_url_override: None,
            request_timeout: Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS),
            open_timeout: Duration::from_secs(DEFAULT_OPEN_TIMEOUT_SECS),
        }
    }
}

impl Configuration {
    /// Construct from environment variables. Returns defaults when vars are
    /// unset — `configured()` reports whether `api_key` is actually present.
    pub fn from_env() -> Self {
        let mut cfg = Self::default();
        if let Ok(v) = std::env::var("BELTIC_API_KEY") {
            cfg.api_key = Some(v);
        }
        if let Ok(v) = std::env::var("BELTIC_BASE_URL") {
            cfg.base_url = v;
        }
        if let Ok(v) = std::env::var("BELTIC_WEBHOOK_SECRET") {
            cfg.webhook_secret = Some(v);
        }
        if let Ok(v) = std::env::var("BELTIC_ORG_CREDENTIAL_ID") {
            cfg.org_credential_id = Some(v);
        }
        if let Ok(v) = std::env::var("BELTIC_ORG_SUBJECT_ID") {
            cfg.org_subject_id = Some(v);
        }
        if let Ok(v) = std::env::var("BELTIC_ISSUER_DID") {
            cfg.issuer_did = v;
        }
        if let Ok(v) = std::env::var("BELTIC_JWKS_URL") {
            cfg.jwks_url_override = Some(v);
        }
        if let Ok(v) = std::env::var("BELTIC_STATUS_LIST_URL") {
            cfg.status_list_url_override = Some(v);
        }
        cfg
    }

    pub fn configured(&self) -> bool {
        self.api_key.as_deref().is_some_and(|s| !s.is_empty())
    }

    /// JWKS endpoint URL. Derived from `base_url` (stripping the `/v1`
    /// suffix and joining `/.well-known/jwks.json`) unless explicitly
    /// overridden.
    pub fn jwks_url(&self) -> BelticResult<String> {
        if let Some(v) = &self.jwks_url_override {
            return Ok(v.clone());
        }
        Ok(well_known(&self.base_url, "jwks.json")?)
    }

    /// Status List 2021 endpoint URL. Same derivation as `jwks_url`.
    pub fn status_list_url(&self) -> BelticResult<String> {
        if let Some(v) = &self.status_list_url_override {
            return Ok(v.clone());
        }
        Ok(well_known(&self.base_url, "status-lists/v1")?)
    }
}

/// Strip a versioned API path suffix (`/v1`, `/v2`, …) from `base_url`
/// and join `.well-known/<suffix>` onto the origin. So
/// `https://api.beltic.com/v1` + `jwks.json` → `https://api.beltic.com/.well-known/jwks.json`.
fn well_known(base_url: &str, suffix: &str) -> BelticResult<String> {
    let mut parsed = Url::parse(base_url)
        .map_err(|e| BelticError::Configuration(format!("invalid base_url: {e}")))?;

    // Strip a leading "/vN[/]" segment if present, leaving the bare origin.
    let mut path = parsed.path().trim_end_matches('/').to_string();
    if let Some(rest) = path.strip_prefix('/') {
        if let Some(first_seg) = rest.split('/').next() {
            if first_seg.starts_with('v')
                && first_seg.len() > 1
                && first_seg[1..].chars().all(|c| c.is_ascii_digit())
            {
                path = rest[first_seg.len()..].to_string();
                if !path.starts_with('/') {
                    path = format!("/{path}");
                }
            }
        }
    }
    parsed.set_path(&format!(
        "{}/.well-known/{}",
        path.trim_end_matches('/'),
        suffix
    ));
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_well_known_from_versioned_base() {
        let cfg = Configuration {
            base_url: "https://api.beltic.com/v1".into(),
            ..Default::default()
        };
        assert_eq!(
            cfg.jwks_url().unwrap(),
            "https://api.beltic.com/.well-known/jwks.json"
        );
        assert_eq!(
            cfg.status_list_url().unwrap(),
            "https://api.beltic.com/.well-known/status-lists/v1"
        );
    }

    #[test]
    fn derives_well_known_from_local_base() {
        let cfg = Configuration {
            base_url: "http://localhost:8080/v1".into(),
            ..Default::default()
        };
        assert_eq!(
            cfg.jwks_url().unwrap(),
            "http://localhost:8080/.well-known/jwks.json"
        );
    }

    #[test]
    fn override_wins_over_derivation() {
        let cfg = Configuration {
            base_url: "https://api.beltic.com/v1".into(),
            jwks_url_override: Some("https://custom.example.com/jwks".into()),
            ..Default::default()
        };
        assert_eq!(cfg.jwks_url().unwrap(), "https://custom.example.com/jwks");
    }

    #[test]
    fn handles_base_without_version_suffix() {
        let cfg = Configuration {
            base_url: "https://api.beltic.com".into(),
            ..Default::default()
        };
        assert_eq!(
            cfg.jwks_url().unwrap(),
            "https://api.beltic.com/.well-known/jwks.json"
        );
    }

    #[test]
    fn configured_requires_non_empty_api_key() {
        let cfg = Configuration::default();
        assert!(!cfg.configured());

        let cfg = Configuration {
            api_key: Some(String::new()),
            ..Default::default()
        };
        assert!(!cfg.configured());

        let cfg = Configuration {
            api_key: Some("sk_staging_xxx".into()),
            ..Default::default()
        };
        assert!(cfg.configured());
    }
}
