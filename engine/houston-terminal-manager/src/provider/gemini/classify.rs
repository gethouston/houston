//! Gemini-specific stderr / result-error classifiers.
//!
//! Stderr fixtures come from the user's real production logs at
//! `~/.dev-houston/logs/backend.log.2026-05-15` — the patterns are NOT
//! invented. Result-error fixtures correspond to the upstream
//! gemini-cli error class names that surface in
//! `result {status:"error", error:{type, message}}` events.

use crate::provider_error_kind::{
    truncate_excerpt, AuthFailureCause, ProviderError, QuotaScope,
};

const PROVIDER: &str = "gemini";
/// Plan-upgrade target for QuotaExhausted. The "Use API key instead"
/// CTA target (`https://aistudio.google.com/app/apikey`) is driven by
/// the frontend, not embedded in the wire shape, because it depends on
/// the user's chosen auth mode.
pub const UPGRADE_URL: &str = "https://ai.google.dev/pricing";

pub(crate) fn classify_stderr(line: &str) -> Option<ProviderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Gemini's exponential-backoff log line. Three sub-patterns share
    // the `Attempt N failed: ...` prefix:
    //
    //  1. "Max attempts reached"          → QuotaExhausted (done waiting)
    //  2. "Retrying after Nms..."         → RateLimited(retry_after = N/1000)
    //  3. anything else with "exhausted"  → RateLimited (no retry hint)
    if trimmed.starts_with("Attempt ") && trimmed.contains(" failed:") {
        let lower = trimmed.to_lowercase();
        let exhausted = lower.contains("exhausted your capacity");

        if lower.contains("max attempts reached") {
            return Some(ProviderError::QuotaExhausted {
                provider: PROVIDER.into(),
                model: None,
                scope: QuotaScope::Unknown,
                message: truncate_excerpt(trimmed),
                upgrade_url: Some(UPGRADE_URL.into()),
            });
        }

        let retry_after_seconds = parse_retrying_after_ms(trimmed).map(ms_to_seconds);
        if exhausted || retry_after_seconds.is_some() {
            return Some(ProviderError::RateLimited {
                provider: PROVIDER.into(),
                model: None,
                retry_after_seconds,
                message: truncate_excerpt(trimmed),
            });
        }
    }

    // Fatal "Error when talking to Gemini API" header line — leave to
    // the structured `result` event for the actionable variant. Don't
    // double-fire here.

    // 401 / auth phrasing surfaced by the upstream Gemini SDK.
    let lower = trimmed.to_lowercase();
    if lower.contains("401") && (lower.contains("unauthorized") || lower.contains("auth")) {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::Unknown,
            message: truncate_excerpt(trimmed),
        });
    }
    if lower.contains("api key") && lower.contains("invalid") {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::InvalidApiKey,
            message: truncate_excerpt(trimmed),
        });
    }
    if lower.contains("missing api key") || lower.contains("no api key") {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::NoCredentials,
            message: truncate_excerpt(trimmed),
        });
    }

    None
}

pub(crate) fn classify_result_error(
    error_type: &str,
    error_message: &str,
) -> Option<ProviderError> {
    match error_type {
        // Long-window quota: the SDK kept retrying and gave up.
        "RetryableQuotaError" => Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            message: truncate_excerpt(error_message),
            upgrade_url: Some(UPGRADE_URL.into()),
        }),
        // Auth class names emitted by gemini-cli's error handler.
        "FatalAuthenticationError" => Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::TokenExpired,
            message: truncate_excerpt(error_message),
        }),
        // Network HTTP wrapper. Try to lift status from the message.
        "GaxiosError" => Some(classify_gaxios(error_message)),
        // The CLI hit its built-in turn limit. Surface as
        // ProviderInternal so the user understands it's not their key.
        "MaxSessionTurnsError" => Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: None,
            message: truncate_excerpt(error_message),
        }),
        _ => None,
    }
}

/// Pick the right variant for a `GaxiosError` based on the embedded HTTP
/// status (when present) or the message wording.
fn classify_gaxios(error_message: &str) -> ProviderError {
    let lower = error_message.to_lowercase();
    if let Some(status) = extract_http_status(error_message) {
        if status == 401 || status == 403 {
            return ProviderError::Unauthenticated {
                provider: PROVIDER.into(),
                cause: AuthFailureCause::Unknown,
                message: truncate_excerpt(error_message),
            };
        }
        if status == 429 {
            return ProviderError::RateLimited {
                provider: PROVIDER.into(),
                model: None,
                retry_after_seconds: None,
                message: truncate_excerpt(error_message),
            };
        }
        if (500..600).contains(&status) {
            return ProviderError::ProviderInternal {
                provider: PROVIDER.into(),
                http_status: Some(status),
                message: truncate_excerpt(error_message),
            };
        }
    }
    if lower.contains("network") || lower.contains("dns") || lower.contains("connect") {
        return ProviderError::NetworkUnreachable {
            provider: PROVIDER.into(),
            message: truncate_excerpt(error_message),
        };
    }
    ProviderError::ProviderInternal {
        provider: PROVIDER.into(),
        http_status: None,
        message: truncate_excerpt(error_message),
    }
}

/// Parse `Retrying after Nms...` → `Some(N)` (milliseconds).
fn parse_retrying_after_ms(line: &str) -> Option<u32> {
    const MARKER: &str = "Retrying after ";
    let idx = line.find(MARKER)?;
    let tail = &line[idx + MARKER.len()..];
    let mut digits = String::new();
    for c in tail.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            break;
        }
    }
    digits.parse().ok()
}

/// Lossless `ms / 1000` rounded to nearest second. 8283ms → 8s.
fn ms_to_seconds(ms: u32) -> u32 {
    (ms + 500) / 1000
}

fn extract_http_status(line: &str) -> Option<u16> {
    for token in line.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 3 {
            if let Ok(n) = token.parse::<u16>() {
                if (100..600).contains(&n) {
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

    // Real fixtures lifted from ~/.dev-houston/logs/backend.log.2026-05-15.
    const ATTEMPT_RETRY_QUOTA_RESET: &str = "Attempt 1 failed: You have exhausted your capacity on this model. Your quota will reset after 7s.. Retrying after 8283ms...";
    const ATTEMPT_RETRY_PLAIN: &str = "Attempt 5 failed: You have exhausted your capacity on this model.. Retrying after 34847ms...";
    const ATTEMPT_MAX_REACHED: &str = "Attempt 10 failed: You have exhausted your capacity on this model.. Max attempts reached";

    #[test]
    fn attempt_max_reached_is_quota_exhausted() {
        match classify_stderr(ATTEMPT_MAX_REACHED).unwrap() {
            ProviderError::QuotaExhausted { provider, upgrade_url, .. } => {
                assert_eq!(provider, "gemini");
                assert_eq!(upgrade_url.as_deref(), Some(UPGRADE_URL));
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn attempt_retrying_extracts_retry_after_seconds() {
        // 8283ms → round to 8s
        match classify_stderr(ATTEMPT_RETRY_QUOTA_RESET).unwrap() {
            ProviderError::RateLimited { retry_after_seconds: Some(8), .. } => {}
            other => panic!("expected RateLimited(8s), got {other:?}"),
        }
    }

    #[test]
    fn attempt_retrying_plain_also_classified_as_rate_limited() {
        // 34847ms → round to 35s
        match classify_stderr(ATTEMPT_RETRY_PLAIN).unwrap() {
            ProviderError::RateLimited { retry_after_seconds: Some(35), .. } => {}
            other => panic!("expected RateLimited(35s), got {other:?}"),
        }
    }

    #[test]
    fn retryable_quota_error_result_classified_as_quota_exhausted() {
        match classify_result_error(
            "RetryableQuotaError",
            "You have exhausted your capacity on this model.",
        )
        .unwrap()
        {
            ProviderError::QuotaExhausted { upgrade_url, .. } => {
                assert_eq!(upgrade_url.as_deref(), Some(UPGRADE_URL));
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn fatal_authentication_error_classified_as_token_expired() {
        match classify_result_error("FatalAuthenticationError", "Login required").unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::TokenExpired);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn gaxios_401_classified_as_unauthenticated() {
        match classify_result_error("GaxiosError", "Request failed with status code 401").unwrap()
        {
            ProviderError::Unauthenticated { .. } => {}
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn gaxios_503_classified_as_provider_internal() {
        match classify_result_error("GaxiosError", "Request failed with status code 503").unwrap()
        {
            ProviderError::ProviderInternal { http_status: Some(503), .. } => {}
            other => panic!("expected ProviderInternal 503, got {other:?}"),
        }
    }

    #[test]
    fn gaxios_429_classified_as_rate_limited() {
        match classify_result_error("GaxiosError", "Request failed with status code 429").unwrap()
        {
            ProviderError::RateLimited { .. } => {}
            other => panic!("expected RateLimited, got {other:?}"),
        }
    }

    #[test]
    fn max_session_turns_classified_as_provider_internal() {
        match classify_result_error("MaxSessionTurnsError", "Maximum session turns exceeded")
            .unwrap()
        {
            ProviderError::ProviderInternal { http_status: None, .. } => {}
            other => panic!("expected ProviderInternal None, got {other:?}"),
        }
    }

    #[test]
    fn unknown_result_error_type_returns_none() {
        assert!(classify_result_error("SomeNewError", "msg").is_none());
    }

    #[test]
    fn invalid_api_key_stderr_classified() {
        match classify_stderr("API key is invalid: please regenerate").unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::InvalidApiKey);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn empty_and_unrelated_lines_return_none() {
        assert!(classify_stderr("").is_none());
        assert!(classify_stderr("   ").is_none());
        assert!(classify_stderr("Loading model metadata...").is_none());
    }
}
