//! Unified [`ProviderError`] taxonomy — the one wire shape every AI
//! provider's CLI failures collapse into.
//!
//! Why this exists
//! ---------------
//! Before this contract every provider produced free-form `String` errors
//! that bottomed out in a generic "tool runtime error" card. That meant:
//! - The UI couldn't tell rate-limited from quota-exhausted, so every
//!   throttle looked like a permanent failure.
//! - The UI couldn't tell auth-expired from network-unreachable, so the
//!   reconnect CTA was wrong half the time.
//! - Adding a fourth provider would require re-doing the same string
//!   matching in three different layers (parser, runner, card).
//!
//! Now every provider classifier returns a [`ProviderError`] variant, the
//! engine emits it as a typed [`crate::FeedItem::ProviderError`], and the
//! frontend renders one card per variant with variant-appropriate CTAs.
//! Adding a new provider = implement the two `classify_*` methods on its
//! adapter, register one i18n key set per variant. No new variants per
//! provider — they share the taxonomy.
//!
//! When to add a new variant
//! -------------------------
//! [`ProviderError::Unknown`] is the catch-all. Every `Unknown` that
//! reaches the user fires a "Report bug" CTA — that's the signal that we
//! should promote the underlying pattern to a real variant. Variants are
//! cheap; do not let `Unknown` calcify into a permanent home for known
//! patterns.

use serde::{Deserialize, Serialize};

/// Cap on raw stderr/JSON snippets carried in [`ProviderError::Unknown`]
/// (and a couple of other variants that quote upstream messages). Picked
/// to stay well under typical WS frame budgets while still giving support
/// enough context to triage. Keep the snippet PII-free — no file paths
/// from the user's home directory, no API keys.
pub const RAW_EXCERPT_MAX: usize = 500;

/// Truncate `s` to at most [`RAW_EXCERPT_MAX`] chars, appending an
/// ellipsis marker so support knows the snippet was clipped.
pub fn truncate_excerpt(s: &str) -> String {
    if s.chars().count() <= RAW_EXCERPT_MAX {
        return s.to_string();
    }
    let mut out: String = s.chars().take(RAW_EXCERPT_MAX).collect();
    out.push_str("...");
    out
}

/// Coarse window the upstream limit applies over. Drives whether the UI
/// suggests "wait a minute" vs "upgrade your plan".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaScope {
    FreeTier,
    PaidPlan,
    Organization,
    Unknown,
}

/// Why a model the user requested isn't usable on this account.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelUnavailableReason {
    PreviewGated,
    Deprecated,
    RegionRestricted,
    Unknown,
}

/// Why authentication failed. Drives whether we offer a Reconnect (token
/// expired) vs Sign-in (no creds) vs API-key-paste (invalid key).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthFailureCause {
    NoCredentials,
    TokenExpired,
    TokenRevoked,
    InvalidApiKey,
    Unknown,
}

/// Typed error emitted by a provider classifier. Round-trips to the
/// frontend as a discriminated union; the wire shape is `{kind, ...}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProviderError {
    /// Per-minute / short-window throttle. User can wait and retry.
    RateLimited {
        provider: String,
        model: Option<String>,
        retry_after_seconds: Option<u32>,
        message: String,
    },
    /// Long-window / billing-period limit. Wait won't help; user needs a
    /// plan upgrade or new credentials.
    QuotaExhausted {
        provider: String,
        model: Option<String>,
        scope: QuotaScope,
        message: String,
        upgrade_url: Option<String>,
    },
    /// Plan-window usage limit the CLI auto-recovers from by sleeping
    /// internally until the reset window. The CLI subprocess is still
    /// alive — Houston should surface this as a non-terminal "paused"
    /// state, NOT an error. Today this only fires for the Anthropic
    /// claude-code CLI's "Claude usage limit reached. Your limit will
    /// reset at HH:MM (TZ)" banner.
    UsageLimitPaused {
        provider: String,
        /// Human-readable reset hint extracted from the banner
        /// (e.g. `"5pm (America/Los_Angeles)"`). `None` if the banner
        /// didn't include a parseable hint.
        resets_at: Option<String>,
        message: String,
    },
    /// Model the user requested isn't available to this account.
    ModelUnavailable {
        provider: String,
        model: String,
        reason: ModelUnavailableReason,
        suggested_fallback: Option<String>,
        message: String,
    },
    /// Auth credentials missing/expired/invalid. User needs to reconnect.
    Unauthenticated {
        provider: String,
        cause: AuthFailureCause,
        message: String,
    },
    /// Network can't reach the provider's API.
    NetworkUnreachable { provider: String, message: String },
    /// Provider-side server error (5xx, transient infra failure).
    ProviderInternal {
        provider: String,
        http_status: Option<u16>,
        message: String,
    },
    /// Resume target doesn't exist (Codex `no rollout found`).
    SessionResumeMissing {
        provider: String,
        session_id: String,
    },
    /// CLI emitted malformed JSON the runner can't parse mid-stream.
    /// Anthropic's "no low surrogate in string" case today; could fire
    /// for any provider on truncated network responses.
    MalformedResponse { provider: String, message: String },
    /// CLI binary couldn't even spawn (not bundled, killed by OS, missing
    /// dependency).
    SpawnFailed {
        provider: String,
        cli_name: String,
        message: String,
    },
    /// User cancelled. Distinct from "error" because the UI should treat
    /// it differently (no toast, no retry CTA, often no card at all).
    Cancelled { provider: String },
    /// Catch-all when no other variant applies. Carries a truncated raw
    /// excerpt for support/debugging. EVERY new pattern someone discovers
    /// in production should be promoted to a real variant — do not let
    /// this become a dumping ground.
    Unknown {
        provider: String,
        raw_excerpt: String,
    },
}

impl ProviderError {
    /// Provider id (e.g. `"anthropic"`) embedded in every variant.
    /// Useful for logging and aggregation; the UI uses it to pick
    /// provider-specific copy / icons.
    pub fn provider(&self) -> &str {
        match self {
            Self::RateLimited { provider, .. }
            | Self::QuotaExhausted { provider, .. }
            | Self::UsageLimitPaused { provider, .. }
            | Self::ModelUnavailable { provider, .. }
            | Self::Unauthenticated { provider, .. }
            | Self::NetworkUnreachable { provider, .. }
            | Self::ProviderInternal { provider, .. }
            | Self::SessionResumeMissing { provider, .. }
            | Self::MalformedResponse { provider, .. }
            | Self::SpawnFailed { provider, .. }
            | Self::Cancelled { provider }
            | Self::Unknown { provider, .. } => provider,
        }
    }

    /// Stable kind string matching the serde tag. Useful for log
    /// aggregation and metric labels (where pulling the tag back out of
    /// JSON is awkward).
    pub fn kind(&self) -> &'static str {
        match self {
            Self::RateLimited { .. } => "rate_limited",
            Self::QuotaExhausted { .. } => "quota_exhausted",
            Self::UsageLimitPaused { .. } => "usage_limit_paused",
            Self::ModelUnavailable { .. } => "model_unavailable",
            Self::Unauthenticated { .. } => "unauthenticated",
            Self::NetworkUnreachable { .. } => "network_unreachable",
            Self::ProviderInternal { .. } => "provider_internal",
            Self::SessionResumeMissing { .. } => "session_resume_missing",
            Self::MalformedResponse { .. } => "malformed_response",
            Self::SpawnFailed { .. } => "spawn_failed",
            Self::Cancelled { .. } => "cancelled",
            Self::Unknown { .. } => "unknown",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_rate_limited() {
        let e = ProviderError::RateLimited {
            provider: "gemini".into(),
            model: Some("gemini-2.5-pro".into()),
            retry_after_seconds: Some(8),
            message: "Quota will reset after 7s".into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(r#""kind":"rate_limited""#));
        let back: ProviderError = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
    }

    #[test]
    fn round_trip_quota_exhausted_with_url() {
        let e = ProviderError::QuotaExhausted {
            provider: "gemini".into(),
            model: None,
            scope: QuotaScope::FreeTier,
            message: "Max attempts reached".into(),
            upgrade_url: Some("https://ai.google.dev/pricing".into()),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(r#""kind":"quota_exhausted""#));
        assert!(json.contains(r#""scope":"free_tier""#));
        let back: ProviderError = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
    }

    #[test]
    fn round_trip_usage_limit_paused() {
        let e = ProviderError::UsageLimitPaused {
            provider: "anthropic".into(),
            resets_at: Some("5pm (America/Los_Angeles)".into()),
            message:
                "Claude usage limit reached. Your limit will reset at 5pm (America/Los_Angeles)"
                    .into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(r#""kind":"usage_limit_paused""#));
        assert!(json.contains(r#""resets_at":"5pm (America/Los_Angeles)""#));
        let back: ProviderError = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
    }

    #[test]
    fn round_trip_unauthenticated_token_expired() {
        let e = ProviderError::Unauthenticated {
            provider: "anthropic".into(),
            cause: AuthFailureCause::TokenExpired,
            message: "OAuth token has expired".into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(r#""cause":"token_expired""#));
        let back: ProviderError = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
    }

    #[test]
    fn provider_helper_returns_id_for_every_variant() {
        let cases = vec![
            ProviderError::RateLimited {
                provider: "p".into(),
                model: None,
                retry_after_seconds: None,
                message: "".into(),
            },
            ProviderError::Cancelled {
                provider: "p".into(),
            },
            ProviderError::Unknown {
                provider: "p".into(),
                raw_excerpt: "".into(),
            },
        ];
        for c in cases {
            assert_eq!(c.provider(), "p");
        }
    }

    #[test]
    fn kind_matches_serde_tag() {
        let e = ProviderError::SessionResumeMissing {
            provider: "openai".into(),
            session_id: "abc".into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(&format!(r#""kind":"{}""#, e.kind())));
    }

    #[test]
    fn truncate_long_excerpt_appends_ellipsis() {
        let long: String = "x".repeat(RAW_EXCERPT_MAX + 100);
        let t = truncate_excerpt(&long);
        assert!(t.ends_with("..."));
        // length is RAW_EXCERPT_MAX chars + 3 for ellipsis
        assert_eq!(t.chars().count(), RAW_EXCERPT_MAX + 3);
    }

    #[test]
    fn short_excerpt_unchanged() {
        let s = "short";
        assert_eq!(truncate_excerpt(s), s);
    }
}
