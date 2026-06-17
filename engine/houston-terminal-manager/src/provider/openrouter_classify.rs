//! OpenRouter stderr / Codex `turn.failed` message classifier.
//!
//! OpenRouter routes through the Codex CLI with a custom
//! `model_providers.openrouter` config (see [`super::CodexBackend`]). Error
//! payloads mirror HTTP status phrasing (`unexpected status 401 …`), so the
//! classifier keys off status codes and OpenRouter-specific wording, mapping
//! each to the shared [`ProviderError`] taxonomy the frontend already
//! renders. See `knowledge-base/provider-errors.md`.

use crate::auth_error::is_auth_error;
use crate::codex_command;
use crate::provider_error_kind::{
    truncate_excerpt, AuthFailureCause, ModelUnavailableReason, ProviderError, QuotaScope,
};

const PROVIDER: &str = "openrouter";

pub(crate) fn classify_stderr(line: &str) -> Option<ProviderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Codex emits internal diagnostics on stderr that are NOT model-API turn
    // failures and must never become a session card:
    //   - `codex_models_manager` logs a failed model-catalog refresh (OpenRouter
    //     returns `{"data":[...]}`, codex wants `{"models":[...]}`) and dumps the
    //     whole multi-hundred-KB catalog body — which almost always contains a
    //     bare "401" / 5xx digit somewhere, tripping the substring checks below
    //     into a false Unauthenticated / ProviderInternal card.
    //   - `rmcp::` logs auth/transport failures for MCP servers the user has in
    //     their own `~/.codex/config.toml`; those are the user's MCP, not the
    //     OpenRouter turn.
    // The turn itself still completes; these lines are pure noise here.
    if trimmed.contains("codex_models_manager")
        || trimmed.contains("rmcp::")
        || trimmed.contains("failed to refresh available models")
    {
        return None;
    }

    let lower = trimmed.to_lowercase();

    if codex_command::is_missing_rollout_error(trimmed) {
        let session_id =
            extract_thread_id_from_rollout_error(trimmed).unwrap_or_else(|| "unknown".to_string());
        return Some(ProviderError::SessionResumeMissing {
            provider: PROVIDER.into(),
            session_id,
        });
    }

    if missing_openrouter_api_key(&lower) {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::NoCredentials,
            message: truncate_excerpt(trimmed),
        });
    }

    if is_auth_error(trimmed) || lower.contains("unexpected status 401") {
        let cause = if lower.contains("invalid") && lower.contains("api key") {
            AuthFailureCause::InvalidApiKey
        } else if missing_openrouter_api_key(&lower) {
            AuthFailureCause::NoCredentials
        } else {
            AuthFailureCause::Unknown
        };
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause,
            message: truncate_excerpt(trimmed),
        });
    }

    if lower.contains("unexpected status 404")
        || parse_http_status(trimmed) == Some(404)
        || lower.contains("model not found")
        || lower.contains("model_not_found")
        || lower.contains("no endpoints found")
    {
        let model = extract_quoted_model(trimmed).unwrap_or_else(|| "this model".into());
        return Some(ProviderError::ModelUnavailable {
            provider: PROVIDER.into(),
            model,
            reason: ModelUnavailableReason::Unknown,
            suggested_fallback: None,
            message: truncate_excerpt(trimmed),
        });
    }

    if lower.contains("unexpected status 402")
        || lower.contains("402 payment")
        || lower.contains("insufficient credits")
        || lower.contains("insufficient balance")
    {
        return Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            // Open-ended credit exhaustion: no reset time, topping up is the
            // path. The frontend's QuotaExhaustedCard supplies OpenRouter's
            // billing URL per-provider (provider-error-cards/shared.tsx).
            resets_at: None,
            message: truncate_excerpt(trimmed),
        });
    }

    if lower.contains("429") || lower.contains("rate_limit") || lower.contains("rate limit") {
        return Some(ProviderError::RateLimited {
            provider: PROVIDER.into(),
            model: None,
            retry_after_seconds: parse_retry_after_seconds(trimmed),
            message: truncate_excerpt(trimmed),
        });
    }

    if lower.contains("unexpected status 503") || parse_http_status(trimmed) == Some(503) {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: Some(503),
            message: truncate_excerpt(trimmed),
        });
    }

    if let Some(status) = parse_http_5xx(trimmed) {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: Some(status),
            message: truncate_excerpt(trimmed),
        });
    }

    if lower.contains("econnrefused")
        || lower.contains("econnreset")
        || lower.contains("enotfound")
        || lower.contains("etimedout")
        || lower.contains("connection refused")
    {
        return Some(ProviderError::NetworkUnreachable {
            provider: PROVIDER.into(),
            message: truncate_excerpt(trimmed),
        });
    }

    None
}

pub(crate) fn classify_result_error(
    _error_type: &str,
    _error_message: &str,
) -> Option<ProviderError> {
    // Codex's NDJSON `result.error` events for OpenRouter carry the same
    // HTTP-status phrasing the stderr path classifies; `codex_parser` runs
    // the message back through `classify_stderr`, so there is nothing
    // OpenRouter-specific to add here.
    None
}

fn extract_quoted_model(line: &str) -> Option<String> {
    let first = line.find('\'')?;
    let rest = &line[first + 1..];
    let end = rest.find('\'')?;
    let model = rest[..end].trim();
    if model.is_empty() {
        None
    } else {
        Some(model.to_string())
    }
}

fn missing_openrouter_api_key(lower: &str) -> bool {
    lower.contains("openrouter_api_key")
        || (lower.contains("openrouter") && lower.contains("api key") && lower.contains("missing"))
        || (lower.contains("environment variable") && lower.contains("openrouter_api_key"))
}

fn extract_thread_id_from_rollout_error(line: &str) -> Option<String> {
    const MARKER: &str = "thread id ";
    let lower = line.to_lowercase();
    let idx = lower.find(MARKER)?;
    let tail = line[idx + MARKER.len()..].trim();
    let id: String = tail
        .chars()
        .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
        .collect();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

fn parse_retry_after_seconds(line: &str) -> Option<u32> {
    let lower = line.to_lowercase();
    for marker in ["retry-after:", "retry after", "retry_after"] {
        if let Some(idx) = lower.find(marker) {
            let tail = &lower[idx + marker.len()..];
            let mut digits = String::new();
            for c in tail.chars() {
                if c.is_ascii_digit() {
                    digits.push(c);
                } else if !digits.is_empty() {
                    break;
                }
            }
            if let Ok(n) = digits.parse::<u32>() {
                return Some(n);
            }
        }
    }
    None
}

fn parse_http_status(line: &str) -> Option<u16> {
    for token in line.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 3 {
            if let Ok(n) = token.parse::<u16>() {
                if (400..600).contains(&n) {
                    return Some(n);
                }
            }
        }
    }
    None
}

fn parse_http_5xx(line: &str) -> Option<u16> {
    parse_http_status(line).filter(|s| (500..600).contains(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_401_maps_to_unauthenticated_invalid_key() {
        let line = "unexpected status 401 Unauthorized: Invalid API key";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated {
                provider,
                cause: AuthFailureCause::InvalidApiKey,
                ..
            } => assert_eq!(provider, "openrouter"),
            other => panic!("expected Unauthenticated InvalidApiKey, got {other:?}"),
        }
    }

    #[test]
    fn missing_env_key_maps_to_no_credentials() {
        let line = "environment variable OPENROUTER_API_KEY is not set";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated {
                provider,
                cause: AuthFailureCause::NoCredentials,
                ..
            } => assert_eq!(provider, "openrouter"),
            other => panic!("expected Unauthenticated NoCredentials, got {other:?}"),
        }
    }

    #[test]
    fn missing_rollout_classified_as_session_resume_missing() {
        let line = "Error: thread/resume: thread/resume failed: no rollout found for thread id 1088f5a4-c484-44d4-b594-585b74a8f859";
        match classify_stderr(line).unwrap() {
            ProviderError::SessionResumeMissing { session_id, .. } => {
                assert_eq!(session_id, "1088f5a4-c484-44d4-b594-585b74a8f859")
            }
            other => panic!("expected SessionResumeMissing, got {other:?}"),
        }
    }

    #[test]
    fn status_404_maps_to_model_unavailable() {
        let line = "unexpected status 404 Not Found: model 'openai/gpt-nonesuch' not found";
        match classify_stderr(line).unwrap() {
            ProviderError::ModelUnavailable {
                provider, model, ..
            } => {
                assert_eq!(provider, "openrouter");
                assert_eq!(model, "openai/gpt-nonesuch");
            }
            other => panic!("expected ModelUnavailable, got {other:?}"),
        }
    }

    #[test]
    fn status_402_maps_to_quota_exhausted() {
        let line = "unexpected status 402 Payment Required: insufficient credits";
        match classify_stderr(line).unwrap() {
            ProviderError::QuotaExhausted {
                provider, scope, ..
            } => {
                assert_eq!(provider, "openrouter");
                assert_eq!(scope, QuotaScope::Unknown);
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn status_429_maps_to_rate_limited_with_retry_after() {
        let line = "429 rate_limit_exceeded retry-after: 30";
        match classify_stderr(line).unwrap() {
            ProviderError::RateLimited {
                provider,
                retry_after_seconds: Some(30),
                ..
            } => assert_eq!(provider, "openrouter"),
            other => panic!("expected RateLimited, got {other:?}"),
        }
    }

    #[test]
    fn rate_limit_without_retry_after() {
        match classify_stderr("429 rate_limit_exceeded").unwrap() {
            ProviderError::RateLimited {
                retry_after_seconds: None,
                ..
            } => {}
            other => panic!("expected RateLimited without retry-after, got {other:?}"),
        }
    }

    #[test]
    fn status_503_and_502_map_to_provider_internal() {
        match classify_stderr("unexpected status 503 Service Unavailable").unwrap() {
            ProviderError::ProviderInternal {
                http_status: Some(503),
                ..
            } => {}
            other => panic!("expected ProviderInternal 503, got {other:?}"),
        }
        match classify_stderr("unexpected status 502 Bad Gateway").unwrap() {
            ProviderError::ProviderInternal {
                http_status: Some(502),
                ..
            } => {}
            other => panic!("expected ProviderInternal 502, got {other:?}"),
        }
    }

    #[test]
    fn network_unreachable_for_econnrefused() {
        match classify_stderr("FetchError: request to openrouter.ai failed, reason: ECONNREFUSED")
            .unwrap()
        {
            ProviderError::NetworkUnreachable { .. } => {}
            other => panic!("expected NetworkUnreachable, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_log_returns_none() {
        assert!(classify_stderr("Reading prompt from stdin").is_none());
    }

    #[test]
    fn codex_internal_noise_never_classified() {
        // The catalog-refresh error dumps a huge JSON body that contains a
        // bare "401" — without the guard this would be a false Unauthenticated
        // card even though the turn succeeds.
        let catalog = r#"ERROR codex_models_manager::manager: failed to refresh available models: failed to decode models response: missing field `models`; body: {"data":[{"id":"x","pricing":{"prompt":"0.00000401"}}]} unexpected status 401"#;
        assert!(classify_stderr(catalog).is_none());
        // MCP transport auth failures are the user's own configured MCP, not
        // the OpenRouter turn.
        let rmcp = r#"ERROR rmcp::transport::worker: worker quit with fatal: AuthRequired(www_authenticate_header: "Bearer error=\"invalid_token\"")"#;
        assert!(classify_stderr(rmcp).is_none());
    }
}
