//! OpenAI / Codex stderr classifier.
//!
//! Replaces the standalone `codex_command::is_missing_rollout_error`
//! check on the runner side with a typed [`ProviderError`] variant. The
//! standalone function is kept (still used by `cli_process` for the
//! resume-retry decision flow) but the user-facing surface is now typed.

use crate::auth_error::is_auth_error;
use crate::codex_command;
use crate::provider_error_kind::{
    truncate_excerpt, AuthFailureCause, ModelUnavailableReason, ProviderError, QuotaScope,
};

const PROVIDER: &str = "openai";

pub(crate) fn classify_stderr(line: &str) -> Option<ProviderError> {
    let lower = line.to_lowercase();

    // Resume-rollout-missing. The session_id we tried to resume isn't
    // anywhere in the codex history. UI prompts the user to start fresh.
    if codex_command::is_missing_rollout_error(line) {
        let session_id = extract_thread_id_from_rollout_error(line)
            .unwrap_or_else(|| "unknown".to_string());
        return Some(ProviderError::SessionResumeMissing {
            provider: PROVIDER.into(),
            session_id,
        });
    }

    // OpenAI rejects coding-specialised models (gpt-5.5-codex, gpt-5-codex)
    // with a 400 when the user is authenticated via a ChatGPT account
    // whose plan does not include them. Surface as a typed
    // ModelUnavailable card with a "switch model" CTA rather than dumping
    // the raw 400 JSON into the feed.
    if lower.contains("is not supported when using codex with a chatgpt account") {
        let model = extract_quoted_model(line).unwrap_or_else(|| "this model".into());
        return Some(ProviderError::ModelUnavailable {
            provider: PROVIDER.into(),
            model,
            reason: ModelUnavailableReason::PreviewGated,
            suggested_fallback: Some("gpt-5.5".into()),
            message: truncate_excerpt(line.trim()),
        });
    }

    // Auth — the codex CLI prints "Please run codex login", 401s, and
    // server-side session kills ("Your access token could not be refreshed.
    // Please log out and sign in again." / "Your session has ended.").
    if is_auth_error(line) {
        let cause = if lower.contains("expired")
            || lower.contains("could not be refreshed")
            || lower.contains("session has ended")
            || lower.contains("sign in again")
        {
            AuthFailureCause::TokenExpired
        } else if lower.contains("invalidated") || lower.contains("revoked") {
            AuthFailureCause::TokenRevoked
        } else if lower.contains("invalid") && lower.contains("api key") {
            AuthFailureCause::InvalidApiKey
        } else if lower.contains("not authenticated")
            || lower.contains("not logged in")
            || lower.contains("please run codex login")
            || lower.contains("codex login")
            || lower.contains("no auth credentials")
        {
            AuthFailureCause::NoCredentials
        } else {
            AuthFailureCause::Unknown
        };
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause,
            message: truncate_excerpt(line.trim()),
        });
    }

    // Rate limit — codex / OpenAI surface 429 with optional retry-after.
    if lower.contains("429")
        || lower.contains("rate_limit_exceeded")
        || lower.contains("rate limit")
    {
        return Some(ProviderError::RateLimited {
            provider: PROVIDER.into(),
            model: None,
            retry_after_seconds: parse_retry_after_seconds(line),
            message: truncate_excerpt(line.trim()),
        });
    }

    // ChatGPT-account Codex usage limit. When a ChatGPT plan's Codex
    // allowance for the billing window is spent, codex fails EVERY turn with
    // "You've hit your usage limit. Upgrade to Plus to continue using Codex
    // (<url>), or try again at <date>." It is NOT a per-minute 429 throttle
    // (waiting a minute won't help) and NOT the API-key "quota exceeded"
    // billing error below — it's the plan allowance. Without this branch it
    // matched nothing and surfaced as a generic "codex hit a runtime error"
    // (HOU-495). Map it to a QuotaExhausted card whose Upgrade CTA points at
    // the plan page codex itself names (free → Plus, Plus → Pro), so the user
    // gets an actionable next step. Must precede the `quota`-keyword branch.
    if lower.contains("usage limit") {
        let scope = if lower.contains("upgrade to plus") {
            QuotaScope::FreeTier
        } else if lower.contains("upgrade to pro") {
            QuotaScope::PaidPlan
        } else {
            QuotaScope::Unknown
        };
        return Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope,
            // codex names the absolute time the allowance frees up; surface it
            // so the card reads "resets <when>" instead of a bare upgrade nag.
            resets_at: extract_reset_hint(line),
            message: truncate_excerpt(line.trim()),
            // Prefer the exact upgrade link codex embeds in the banner; fall
            // back to the ChatGPT plan page if a future banner drops it.
            upgrade_url: extract_first_url(line)
                .or_else(|| Some("https://chatgpt.com/explore/plus".into())),
        });
    }

    // Quota exhausted — paid plan / org quota.
    if lower.contains("quota") && (lower.contains("exceed") || lower.contains("exhaust")) {
        return Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            resets_at: None,
            message: truncate_excerpt(line.trim()),
            upgrade_url: Some("https://platform.openai.com/account/billing".into()),
        });
    }

    // Server-side. Codex prints `unexpected status 5XX` on the failure path.
    if let Some(status) = parse_http_5xx(line) {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: Some(status),
            message: truncate_excerpt(line.trim()),
        });
    }

    // Network.
    if lower.contains("econnrefused")
        || lower.contains("econnreset")
        || lower.contains("enotfound")
        || lower.contains("etimedout")
        || lower.contains("connection refused")
    {
        return Some(ProviderError::NetworkUnreachable {
            provider: PROVIDER.into(),
            message: truncate_excerpt(line.trim()),
        });
    }

    None
}

/// Codex doesn't currently emit a structured `result.error.type` field
/// — its NDJSON `result {status:"error"}` is detected via `is_error`
/// at the parser level. Stub kept so the trait stays uniform.
pub(crate) fn classify_result_error(
    _error_type: &str,
    _error_message: &str,
) -> Option<ProviderError> {
    None
}

/// Try to lift the thread/session UUID out of the
/// `no rollout found for thread id <uuid>` line.
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

/// Pull a model name out of the "The 'gpt-5.5-codex' model is not
/// supported when using Codex with a ChatGPT account" pattern. Falls
/// back to None when no single-quoted token is present.
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

/// Pull the first `http(s)://…` token out of a CLI message. Codex's
/// usage-limit banner embeds the exact upgrade URL (e.g.
/// `…(https://chatgpt.com/explore/plus)…`); reusing it keeps the Upgrade CTA
/// correct across plan tiers instead of hard-coding a single target. Stops at
/// the first whitespace or closing bracket/quote so trailing punctuation
/// (the `)` after the URL) is not captured.
fn extract_first_url(line: &str) -> Option<String> {
    let start = line.find("http")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c.is_whitespace() || matches!(c, ')' | ']' | '"' | '>' | '<'))
        .unwrap_or(rest.len());
    let url = &rest[..end];
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

/// Lift the reset hint out of codex's "…, or try again at <when>." tail.
/// The banner names an absolute time the Codex allowance frees up
/// (e.g. `Jul 1st, 2026 1:16 PM`); we surface it verbatim on the quota card.
/// Returns `None` when the banner names no reset (open-ended limit). The
/// marker is ASCII, so the lowercase byte offset is valid in the original.
fn extract_reset_hint(line: &str) -> Option<String> {
    const MARKER: &str = "try again at ";
    let idx = line.to_lowercase().find(MARKER)?;
    let hint = line[idx + MARKER.len()..].trim().trim_end_matches('.').trim();
    if hint.is_empty() {
        None
    } else {
        Some(hint.to_string())
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
    fn missing_rollout_classified_as_session_resume_missing() {
        let line = "Error: thread/resume: thread/resume failed: no rollout found for thread id 1088f5a4-c484-44d4-b594-585b74a8f859";
        match classify_stderr(line).unwrap() {
            ProviderError::SessionResumeMissing { session_id, .. } => {
                assert_eq!(session_id, "1088f5a4-c484-44d4-b594-585b74a8f859");
            }
            other => panic!("expected SessionResumeMissing, got {other:?}"),
        }
    }

    #[test]
    fn please_run_codex_login_classified_as_no_credentials() {
        let line = "Please run codex login";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated { cause, .. } => {
                assert_eq!(cause, AuthFailureCause::NoCredentials);
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn unexpected_status_401_classified_as_unauthenticated() {
        let line = "unexpected status 401 Unauthorized: Missing bearer";
        match classify_stderr(line).unwrap() {
            ProviderError::Unauthenticated { .. } => {}
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn rate_limit_extracts_retry_after() {
        let line = "429 rate_limit_exceeded retry-after: 12";
        match classify_stderr(line).unwrap() {
            ProviderError::RateLimited {
                retry_after_seconds: Some(12),
                ..
            } => {}
            other => panic!("expected RateLimited(12), got {other:?}"),
        }
    }

    #[test]
    fn quota_exhausted_includes_billing_url() {
        let line = "Quota exceeded for this account";
        match classify_stderr(line).unwrap() {
            ProviderError::QuotaExhausted { upgrade_url, .. } => {
                assert!(upgrade_url.unwrap().contains("openai.com"));
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn codex_usage_limit_classified_as_quota_exhausted_free_tier() {
        // The exact codex banner a ChatGPT free-tier user hits once their
        // Codex allowance is spent (HOU-495). Previously matched nothing and
        // showed a generic "codex hit a runtime error"; now a QuotaExhausted
        // card with a Plus upgrade CTA pulled straight from the banner.
        let line = "You've hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at Jul 1st, 2026 1:16 PM.";
        match classify_stderr(line).unwrap() {
            ProviderError::QuotaExhausted {
                provider,
                scope,
                resets_at,
                upgrade_url,
                ..
            } => {
                assert_eq!(provider, "openai");
                assert_eq!(scope, QuotaScope::FreeTier);
                assert_eq!(resets_at.as_deref(), Some("Jul 1st, 2026 1:16 PM"));
                assert_eq!(
                    upgrade_url.as_deref(),
                    Some("https://chatgpt.com/explore/plus")
                );
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn extract_reset_hint_pulls_date_without_trailing_period() {
        let line = "You've hit your usage limit. ..., or try again at Jul 1st, 2026 1:16 PM.";
        assert_eq!(
            extract_reset_hint(line).as_deref(),
            Some("Jul 1st, 2026 1:16 PM")
        );
        // No reset named → None (open-ended limit).
        assert!(extract_reset_hint("Quota exceeded for this account").is_none());
    }

    #[test]
    fn codex_usage_limit_is_not_misfiled_as_rate_limited() {
        // "usage limit" is a billing-window cap, not a 429 throttle — a wait
        // won't clear it. Must NOT fall into the RateLimited branch.
        let line = "You've hit your usage limit. Upgrade to Plus to continue using Codex.";
        assert!(matches!(
            classify_stderr(line),
            Some(ProviderError::QuotaExhausted { .. })
        ));
    }

    #[test]
    fn extract_first_url_pulls_banner_link_without_trailing_paren() {
        let line = "limit (https://chatgpt.com/explore/plus), or try again";
        assert_eq!(
            extract_first_url(line).as_deref(),
            Some("https://chatgpt.com/explore/plus")
        );
        assert!(extract_first_url("no link here").is_none());
    }

    #[test]
    fn http_503_classified_as_provider_internal() {
        let line = "unexpected status 503 service unavailable";
        match classify_stderr(line).unwrap() {
            ProviderError::ProviderInternal {
                http_status: Some(503),
                ..
            } => {}
            other => panic!("expected ProviderInternal 503, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_log_returns_none() {
        assert!(classify_stderr("Reading prompt from stdin").is_none());
    }

    #[test]
    fn extract_thread_id_pulls_uuid() {
        let line = "no rollout found for thread id deadbeef-1234-5678-9abc-def012345678";
        assert_eq!(
            extract_thread_id_from_rollout_error(line),
            Some("deadbeef-1234-5678-9abc-def012345678".to_string())
        );
    }
}
