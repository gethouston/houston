//! HTTP client for Beltic's Credentials API.
//!
//! Thin wrapper around `reqwest::Client` that:
//! - injects `X-Api-Key`
//! - parses Beltic's nested error envelope `{ "error": { "code", "message" } }`
//!   into typed `BelticError` variants
//! - exposes generic `post_json` / `get_json` / `delete_json` so per-resource
//!   methods on `Issuer` stay short
//!
//! Retries are NOT inside this client — call sites (e.g., a background job
//! that drives credential issuance) own backoff policy. The client returns
//! `BelticError::is_retryable()` so callers can decide.

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE, USER_AGENT};
use serde::{de::DeserializeOwned, Serialize};

use crate::config::Configuration;
use crate::errors::{BelticError, BelticResult};

#[derive(Debug, Clone)]
pub struct Client {
    inner: reqwest::Client,
    config: Configuration,
}

impl Client {
    pub fn new(config: Configuration) -> BelticResult<Self> {
        if !config.configured() {
            return Err(BelticError::Configuration(
                "api_key not set — set BELTIC_API_KEY before constructing the client".into(),
            ));
        }
        let inner = build_reqwest_client(&config)?;
        Ok(Self { inner, config })
    }

    pub fn config(&self) -> &Configuration {
        &self.config
    }

    pub async fn post_json<Req, Res>(&self, path: &str, body: &Req) -> BelticResult<Res>
    where
        Req: Serialize + ?Sized,
        Res: DeserializeOwned,
    {
        let response = self
            .inner
            .post(self.url(path))
            .json(body)
            .send()
            .await
            .map_err(transport_err)?;
        handle_response(response).await
    }

    pub async fn get_json<Res>(&self, path: &str) -> BelticResult<Res>
    where
        Res: DeserializeOwned,
    {
        let response = self
            .inner
            .get(self.url(path))
            .send()
            .await
            .map_err(transport_err)?;
        handle_response(response).await
    }

    pub async fn delete_json<Res>(&self, path: &str) -> BelticResult<Res>
    where
        Res: DeserializeOwned,
    {
        let response = self
            .inner
            .delete(self.url(path))
            .send()
            .await
            .map_err(transport_err)?;
        handle_response(response).await
    }

    fn url(&self, path: &str) -> String {
        let base = self.config.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{base}/{path}")
    }
}

fn build_reqwest_client(config: &Configuration) -> BelticResult<reqwest::Client> {
    let mut headers = HeaderMap::new();
    let api_key_value = HeaderValue::from_str(config.api_key.as_deref().unwrap_or(""))
        .map_err(|e| BelticError::Configuration(format!("api_key not a valid header: {e}")))?;
    let api_header_name = HeaderName::from_static("x-api-key");
    headers.insert(api_header_name, api_key_value);
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("houston-engine houston-beltic"),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(config.request_timeout)
        .connect_timeout(config.open_timeout)
        .build()
        .map_err(|e| BelticError::Configuration(format!("failed to build reqwest client: {e}")))
}

fn transport_err(e: reqwest::Error) -> BelticError {
    BelticError::Transport(e.to_string())
}

async fn handle_response<Res: DeserializeOwned>(response: reqwest::Response) -> BelticResult<Res> {
    let status = response.status();
    let body_bytes = response.bytes().await.map_err(transport_err)?;

    if status.is_success() {
        return serde_json::from_slice::<Res>(&body_bytes).map_err(|e| {
            BelticError::BadResponseBody(format!(
                "could not decode success body: {e} (body: {})",
                preview(&body_bytes),
            ))
        });
    }

    // Try to parse Beltic's nested error envelope. Fall back to a synthetic
    // error if the body isn't JSON (rare but possible on infra layer like
    // nginx 504 / API Gateway 503).
    match serde_json::from_slice::<EnvelopeWire>(&body_bytes) {
        Ok(wire) => {
            let code = wire.error.code;
            let message = wire.error.message;
            Err(BelticError::from_envelope(status.as_u16(), &code, &message))
        }
        Err(_) => Err(BelticError::Client {
            code: format!("http_{}", status.as_u16()),
            message: preview(&body_bytes),
        }),
    }
}

fn preview(bytes: &[u8]) -> String {
    let s = String::from_utf8_lossy(bytes);
    if s.len() <= 256 {
        s.into_owned()
    } else {
        format!("{}…", &s[..256])
    }
}

/// Wire shape of Beltic's nested error envelope. We accept either
/// `details` or `request_id` being null/absent.
#[derive(Debug, serde::Deserialize)]
struct EnvelopeWire {
    error: EnvelopeBody,
}

#[derive(Debug, serde::Deserialize)]
struct EnvelopeBody {
    code: String,
    message: String,
    #[serde(default)]
    #[allow(dead_code)]
    request_id: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    details: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_construction_without_api_key() {
        let cfg = Configuration::default();
        let err = Client::new(cfg).unwrap_err();
        assert!(matches!(err, BelticError::Configuration(_)));
    }

    #[test]
    fn url_joins_path_without_double_slash() {
        let cfg = Configuration {
            api_key: Some("sk_test_xxx".into()),
            base_url: "http://localhost:8080/v1".into(),
            ..Default::default()
        };
        let client = Client::new(cfg).unwrap();
        assert_eq!(
            client.url("/credentials"),
            "http://localhost:8080/v1/credentials"
        );
        // Without leading slash on path
        assert_eq!(
            client.url("credentials/cred_abc"),
            "http://localhost:8080/v1/credentials/cred_abc"
        );
        // Without trailing slash on base
        let cfg2 = Configuration {
            api_key: Some("sk_test_xxx".into()),
            base_url: "http://localhost:8080/v1/".into(),
            ..Default::default()
        };
        let client = Client::new(cfg2).unwrap();
        assert_eq!(
            client.url("/credentials"),
            "http://localhost:8080/v1/credentials"
        );
    }

    #[test]
    fn beltic_unused_field_warnings_kept_off() {
        // Compile-only check: EnvelopeBody parses successfully when
        // `details` and `request_id` are absent.
        let raw = br#"{"error":{"code":"validation_failed","message":"x"}}"#;
        let env: EnvelopeWire = serde_json::from_slice(raw).unwrap();
        assert_eq!(env.error.code, "validation_failed");
    }

    #[test]
    fn preview_truncates_long_bodies() {
        let long = vec![b'a'; 1024];
        let p = preview(&long);
        assert!(p.ends_with('…'));
        assert!(p.len() < 1024);
    }
}
