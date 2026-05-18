//! Anthropic-specific stderr / result-error classifiers.
//!
//! Lives next to [`super::anthropic`] so the patterns and the adapter
//! that registers them are co-located. Tested with real CLI output
//! captured from `claude` runs.

use crate::auth_error::is_auth_error;
use crate::provider_error_kind::{
    truncate_excerpt, AuthFailureCause, ProviderError, QuotaScope,
};

const PROVIDER: &str = "anthropic";

/// Detect the malformed-JSON error the Anthropic CLI emits when a
/// request body contains an unpaired UTF-16 high surrogate. Same
/// substring match the runner used previously, just promoted to a typed
/// variant. See `provider_error.rs` (the legacy detector) for the
/// historical context.
pub(crate) fn detect_malformed_provider_json(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("request body is not valid json")
        && lower.contains("no low surrogate in string")
}

pub(crate) fn classify_stderr(line: &str) -> Option<ProviderError> {
    let lower = line.to_lowercase();

    if detect_malformed_provider_json(line) {
        return Some(ProviderError::MalformedResponse {
            provider: PROVIDER.into(),
            message: truncate_excerpt(line.trim()),
        });
    }

    // Auth — covers the full set in `auth_error::is_auth_error`. Try to
    // narrow the cause from the wording when possible; default to
    // Unknown so the UI still drives the user to the reconnect flow.
    if is_auth_error(line) {
        let cause = if lower.contains("expired") {
            AuthFailureCause::TokenExpired
        } else if lower.contains("invalid api key") || lower.contains("invalid_api_key") {
            AuthFailureCause::InvalidApiKey
        } else if lower.contains("not authenticated")
            || lower.contains("not logged in")
            || lower.contains("no api key")
            || lower.contains("no auth credentials")
        {
            AuthFailureCause::NoCredentials
        } else if lower.contains("revoked") {
            AuthFailureCause::TokenRevoked
        } else {
            AuthFailureCause::Unknown
        };
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause,
            message: truncate_excerpt(line.trim()),
        });
    }

    // 429 + rate limit phrasing — claude-code surfaces this with a
    // `retry after Ns` hint we can extract for the countdown CTA.
    if lower.contains("429") || lower.contains("rate limit") || lower.contains("rate_limit") {
        let retry_after_seconds = parse_retry_after_seconds(line);
        return Some(ProviderError::RateLimited {
            provider: PROVIDER.into(),
            model: None,
            retry_after_seconds,
            message: truncate_excerpt(line.trim()),
        });
    }

    // Long-window quota — the user needs a plan upgrade, not a wait.
    if (lower.contains("quota") && lower.contains("exhaust"))
        || lower.contains("usage limit")
        || lower.contains("monthly limit")
    {
        return Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            message: truncate_excerpt(line.trim()),
            upgrade_url: Some("https://www.anthropic.com/pricing".into()),
        });
    }

    // 5xx and explicit upstream-down phrasing.
    if let Some(status) = parse_http_5xx(line) {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: Some(status),
            message: truncate_excerpt(line.trim()),
        });
    }

    // Network — connection refused, ECONNRESET, ENOTFOUND, etc.
    if lower.contains("econnrefused")
        || lower.contains("econnreset")
        || lower.contains("enotfound")
        || lower.contains("etimedout")
        || lower.contains("network is unreachable")
        || lower.contains("connection refused")
        || lower.contains("dns")
            && (lower.contains("fail") || lower.contains("not found"))
    {
        return Some(ProviderError::NetworkUnreachable {
            provider: PROVIDER.into(),
            message: truncate_excerpt(line.trim()),
        });
    }

    None
}

/// Classify an Anthropic `result {is_error:true}` payload.
///
/// `error_type` is the event's `subtype` field (e.g. `"error"`,
/// `"error_during_execution"`, `"error_max_turns"`); `error_message` is
/// the human-readable `result` string the CLI emitted. Returns `None`
/// when no specific variant fits — the parser then falls back to
/// `Unknown` rather than a generic SystemMessage so the user always
/// gets a typed card with a Report-bug CTA.
pub(crate) fn classify_result_error(
    error_type: &str,
    error_message: &str,
) -> Option<ProviderError> {
    let lower_type = error_type.to_lowercase();
    let lower_msg = error_message.to_lowercase();

    if lower_type.contains("max_turns") || lower_msg.contains("max turns") {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: None,
            message: truncate_excerpt(error_message),
        });
    }

    // Reuse the stderr classifier — the result-message text often carries
    // the same auth/quota/rate-limit phrasing the CLI prints to stderr,
    // so we get exhaustive coverage from one set of patterns.
    classify_stderr(error_message)
}

/// Pull `N` from "retry after N seconds" / "retry-after: N" patterns.
/// Returns `None` if no plausible value is found.
fn parse_retry_after_seconds(line: &str) -> Option<u32> {
    let lower = line.to_lowercase();
    // Try common phrasings.
    for marker in ["retry-after:", "retry after", "retry_after:", "retry_after"] {
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

/// Extract a 5xx HTTP status from a stderr line like
/// `API Error: 503 service_unavailable`. Returns `None` for non-5xx.
fn parse_http_5xx(line: &str) -> Option<u16> {
    for token in line.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 3 {
            if let Ok(n) = token.parse::<u16>() {
                if (500..600).contains(&n) {
                    return Some(n);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_low_surrogate_is_malformed_response() {
        let line = r#"API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"The request body is not valid JSON: no low surrogate in string: line 1 column 459046 (char 459045)"}}"#;
        match classify_stderr(line).unwrap() {
            ProviderError::MalformedResponse { provider, .. } => {
                assert_eq!(provider, "anthropic");
            }
            other => panic!("expected MalformedResponse, got {other:?}"),
        }
    }

    #[test]
    fn auth_token_expired_classified_as_token_expired() {
        let line = "OAuth token has expired";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::TokenExpired);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn auth_invalid_api_key_classified_as_invalid_api_key() {
        let line = "Invalid API key. Please login again.";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::InvalidApiKey);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn auth_no_credentials_classified_as_no_credentials() {
        let line = "Claude Code is not authenticated. Run claude auth login";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::NoCredentials);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn rate_limit_with_retry_after_extracted() {
        let line = "API Error: 429 rate_limit_exceeded retry-after: 30";
        match classify_stderr(line).unwrap() {
            ProviderError::RateLimited {
                retry_after_seconds: Some(30),
                ..
            } => {}
            other => panic!("expected RateLimited with retry_after=30, got {other:?}"),
        }
    }

    #[test]
    fn quota_exhausted_includes_upgrade_url() {
        let line = "Monthly limit exhausted for plan";
        match classify_stderr(line).unwrap() {
            ProviderError::QuotaExhausted { upgrade_url, .. } => {
                assert!(upgrade_url.unwrap().contains("anthropic.com"));
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn http_5xx_classified_as_provider_internal() {
        let line = "API Error: 503 service_unavailable retry the request";
        match classify_stderr(line).unwrap() {
            ProviderError::ProviderInternal {
                http_status: Some(503),
                ..
            } => {}
            other => panic!("expected ProviderInternal 503, got {other:?}"),
        }
    }

    #[test]
    fn network_unreachable_for_econnrefused() {
        let line = "FetchError: request to api.anthropic.com failed, reason: ECONNREFUSED";
        match classify_stderr(line).unwrap() {
            ProviderError::NetworkUnreachable { .. } => {}
            other => panic!("expected NetworkUnreachable, got {other:?}"),
        }
    }

    #[test]
    fn informational_log_returns_none() {
        assert!(classify_stderr("Reading prompt from stdin...").is_none());
        assert!(classify_stderr("warning: harmless detail").is_none());
        assert!(classify_stderr("").is_none());
    }
}
