//! Provider abstraction — trait + registry replacing the old `Provider` enum.
//!
//! Each AI backend (Anthropic, OpenAI, Gemini, ...) is one [`ProviderAdapter`]
//! impl held in a static registry. Call sites that used to `match` over the
//! enum now ask the adapter directly:
//!
//! ```ignore
//! let provider = parse("anthropic")?;
//! provider.cli_name();         // "claude"
//! provider.resolve();          // (InstallSource, Option<PathBuf>)
//! provider.login_args();       // Some(&["auth", "login", "--claudeai"])
//! provider.probe_auth(path).await;
//! ```
//!
//! The user-facing wire shape is unchanged: ids serialize as
//! `"anthropic"` / `"openai"`, and [`Provider`] still implements
//! `Serialize` / `Deserialize` / `Display` / `FromStr`. Internally
//! `Provider` is a `Copy` newtype around `&'static dyn ProviderAdapter`,
//! so passing it into functions and storing it in structs costs nothing.
//!
//! Adding a new provider = one new file (e.g. `gemini.rs`) registered in
//! the [`REGISTRY`] array. No callers to update.

mod anthropic;
pub(crate) mod anthropic_classify;
mod gemini;
mod openai;
mod openai_classify;
mod resolve;

pub(crate) use anthropic_classify::detect_malformed_provider_json;

use crate::provider_auth::ProviderAuthState;
use crate::provider_error_kind::{truncate_excerpt, ProviderError};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::str::FromStr;

pub use resolve::{which_on_path, InstallSource};

/// Future type returned by [`ProviderAdapter::probe_auth`]. Boxed so the
/// trait stays object-safe without the `async-trait` macro (which would
/// allocate a `Pin<Box<dyn Future>>` on every call anyway).
pub type ProbeFuture<'a> = Pin<Box<dyn Future<Output = ProviderAuthState> + Send + 'a>>;

/// One AI provider's CLI integration. Every method is intended to be
/// cheap to call repeatedly — the registry hands out shared `&'static`
/// references and there is no per-call setup.
pub trait ProviderAdapter: Send + Sync + 'static {
    /// Stable identifier used in URLs, JSON, settings (e.g. `"anthropic"`,
    /// `"openai"`). Lower-snake-case. MUST match the on-disk directory
    /// name under `.houston/sessions/<id>/`.
    fn id(&self) -> &'static str;

    /// Display name of the CLI binary (`"claude"`, `"codex"`). Surfaced
    /// in user-visible error strings and probe logs.
    fn cli_name(&self) -> &'static str;

    /// Aliases accepted by [`Provider::from_str`] in addition to `id`.
    /// Keeps user-typed values like `"claude"` or `"codex"` working
    /// alongside the canonical id.
    fn aliases(&self) -> &'static [&'static str] {
        &[]
    }

    /// Resolve the CLI binary on disk. Returns where the binary came
    /// from (bundled with Houston, runtime-installed by Houston, found
    /// on PATH, or missing) and the absolute path to spawn.
    fn resolve(&self) -> (InstallSource, Option<PathBuf>);

    /// Probe whether the user is currently authenticated with this
    /// provider's CLI. Receives the resolved CLI path.
    fn probe_auth<'a>(&'a self, cli_path: &'a Path) -> ProbeFuture<'a>;

    /// Argv to pass to the CLI to launch a login flow. `None` means the
    /// provider has no CLI-driven login (e.g. an API-key provider where
    /// auth happens via a settings file or env var). Callers must surface
    /// a different connect UX in that case rather than spawning the CLI.
    fn login_args(&self) -> Option<&'static [&'static str]>;

    /// Argv for a *headless / device-code* login flow, when the provider's
    /// CLI offers one distinct from [`Self::login_args`].
    ///
    /// Returns `None` by default: most providers' standard login already
    /// works on a remote engine (Claude prints a paste-back code; Gemini
    /// drives its own browser identity), so callers fall back to
    /// [`Self::login_args`]. OpenAI overrides this because plain
    /// `codex login` starts a `localhost:1455` loopback server and prints
    /// an OAuth URL whose `redirect_uri` points back at that local port —
    /// reachable from the desktop app (browser + engine share a machine)
    /// but a dead end when the engine runs on a VPS and the browser is on
    /// the user's laptop. Only `codex login --device-auth` (the OAuth
    /// device-grant flow) completes across machines.
    fn device_login_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    /// Argv to pass to the CLI to launch a logout flow. `None` semantics
    /// match [`Self::login_args`].
    fn logout_args(&self) -> Option<&'static [&'static str]>;

    // -------------------------------------------------------------------
    // Error classification
    //
    // The runner pipes every stderr line through [`Self::classify_stderr`]
    // and every structured `result {status:"error"}` event from the
    // NDJSON parser through [`Self::classify_result_error`]. Both have
    // default impls that return `None`, so existing adapters compile
    // unchanged; per-provider impls override them to map known patterns
    // to typed [`ProviderError`] variants. See
    // `knowledge-base/provider-errors.md` for the full taxonomy and the
    // adding-a-provider checklist.
    // -------------------------------------------------------------------

    /// Classify a single stderr line emitted by this provider's CLI.
    ///
    /// Most lines are informational logs and return `None`; only known
    /// error patterns return `Some(ProviderError)`. The runner emits the
    /// returned error as a typed [`crate::FeedItem::ProviderError`].
    ///
    /// Implementations should be cheap (substring / regex on the line)
    /// and free of any side effects — this method is called on the hot
    /// stderr-read path for every line.
    fn classify_stderr(&self, _line: &str) -> Option<ProviderError> {
        None
    }

    /// Classify a structured `result {status:"error"}` event from the
    /// NDJSON parser. `error_type` is the upstream class name (e.g.
    /// Gemini's `"RetryableQuotaError"`, Codex's enum string), and
    /// `error_message` is the human-readable detail.
    ///
    /// Returns `None` if the type isn't recognised; the caller falls
    /// back to a generic [`ProviderError::Unknown`] using the message as
    /// the raw excerpt.
    fn classify_result_error(
        &self,
        _error_type: &str,
        _error_message: &str,
    ) -> Option<ProviderError> {
        None
    }

    /// Classify a process spawn failure (non-zero exit + collected
    /// stderr). Default impl returns [`ProviderError::SpawnFailed`] with
    /// the truncated stderr excerpt — providers override only when they
    /// have spawn-specific patterns to surface differently.
    fn classify_spawn_failure(
        &self,
        _exit_code: Option<i32>,
        stderr_excerpt: &str,
    ) -> ProviderError {
        ProviderError::SpawnFailed {
            provider: self.id().into(),
            cli_name: self.cli_name().into(),
            message: truncate_excerpt(stderr_excerpt),
        }
    }

    // -------------------------------------------------------------------
    // Reasoning effort
    // -------------------------------------------------------------------

    /// Reasoning-effort levels this provider's CLI accepts, ordered
    /// low→high. An empty slice means the provider has no effort control,
    /// so the runner omits the flag entirely (e.g. Gemini).
    ///
    /// This is the provider-level *superset* the engine uses to validate
    /// the agent's configured effort and to clamp it before spawning.
    /// Per-model availability (e.g. Sonnet 4.6 has `max` but not `xhigh`)
    /// is a frontend-picker concern — Claude self-clamps an unsupported
    /// value down to its highest supported level, so the engine only needs
    /// the union here. Codex has no such fallback, which is exactly why
    /// `max` (an unknown variant to codex) is excluded from OpenAI's set.
    fn effort_levels(&self) -> &'static [&'static str] {
        &[]
    }

    /// Default reasoning effort applied when the agent hasn't configured a
    /// value the provider accepts. `None` means "pass no effort flag".
    /// When `Some`, the value MUST be a member of [`Self::effort_levels`].
    fn default_effort(&self) -> Option<&'static str> {
        None
    }
}

/// All registered providers. Add a new provider by importing its module
/// above and pushing its singleton here. No other call site needs to
/// change.
const REGISTRY: &[&dyn ProviderAdapter] = &[
    &anthropic::ANTHROPIC,
    &openai::OPENAI,
    &gemini::GEMINI,
];

/// Default provider used when nothing else is configured. Stays Anthropic
/// to match historical behavior.
const DEFAULT_PROVIDER: &dyn ProviderAdapter = &anthropic::ANTHROPIC;

/// Lookup an adapter by id or alias. Returns `None` for unknown values.
pub fn get(id: &str) -> Option<&'static dyn ProviderAdapter> {
    let lower = id.to_lowercase();
    for adapter in REGISTRY {
        if adapter.id() == lower {
            return Some(*adapter);
        }
        if adapter.aliases().iter().any(|a| *a == lower) {
            return Some(*adapter);
        }
    }
    None
}

/// All registered providers, in registration order. Used by callers that
/// need to sweep every provider (session-id history reads, integration
/// status pages).
pub fn all() -> &'static [&'static dyn ProviderAdapter] {
    REGISTRY
}

/// Default provider used when nothing else is configured.
pub fn default_provider() -> Provider {
    Provider(DEFAULT_PROVIDER)
}

// -----------------------------------------------------------------------
// Provider — Copy newtype over &'static dyn ProviderAdapter
// -----------------------------------------------------------------------

/// Identifier-like handle to a registered [`ProviderAdapter`]. Cheap to
/// `Copy` (the same size as a fat pointer) and serializes as the
/// adapter's [`ProviderAdapter::id`] string so the wire shape matches
/// what older releases produced.
#[derive(Clone, Copy)]
pub struct Provider(pub(crate) &'static dyn ProviderAdapter);

impl Provider {
    /// Adapter id (e.g. `"anthropic"`).
    pub fn id(self) -> &'static str {
        self.0.id()
    }

    /// Display name of the CLI binary (e.g. `"claude"`).
    pub fn cli_name(self) -> &'static str {
        self.0.cli_name()
    }

    /// Resolve the on-disk CLI binary for this provider.
    pub fn resolve(self) -> (InstallSource, Option<PathBuf>) {
        self.0.resolve()
    }

    /// Probe authentication state for this provider's CLI.
    pub async fn probe_auth(self, cli_path: &Path) -> ProviderAuthState {
        self.0.probe_auth(cli_path).await
    }

    /// Argv for `<cli> <login_args>`. `None` if this provider has no CLI
    /// login flow.
    pub fn login_args(self) -> Option<&'static [&'static str]> {
        self.0.login_args()
    }

    /// Argv for a headless/device-code login, if this provider has one
    /// distinct from [`Self::login_args`]. See
    /// [`ProviderAdapter::device_login_args`].
    pub fn device_login_args(self) -> Option<&'static [&'static str]> {
        self.0.device_login_args()
    }

    /// Argv for `<cli> <logout_args>`. `None` if this provider has no
    /// CLI logout flow.
    pub fn logout_args(self) -> Option<&'static [&'static str]> {
        self.0.logout_args()
    }

    /// Reference to the underlying adapter. Useful when callers want to
    /// reach methods that aren't mirrored on `Provider` directly.
    pub fn adapter(self) -> &'static dyn ProviderAdapter {
        self.0
    }

    /// Classify a single stderr line. See
    /// [`ProviderAdapter::classify_stderr`].
    pub fn classify_stderr(self, line: &str) -> Option<ProviderError> {
        self.0.classify_stderr(line)
    }

    /// Classify a structured `result.error` event. See
    /// [`ProviderAdapter::classify_result_error`].
    pub fn classify_result_error(
        self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        self.0.classify_result_error(error_type, error_message)
    }

    /// Classify a process spawn failure. See
    /// [`ProviderAdapter::classify_spawn_failure`].
    pub fn classify_spawn_failure(
        self,
        exit_code: Option<i32>,
        stderr_excerpt: &str,
    ) -> ProviderError {
        self.0.classify_spawn_failure(exit_code, stderr_excerpt)
    }

    /// Reasoning-effort levels this provider accepts. See
    /// [`ProviderAdapter::effort_levels`].
    pub fn effort_levels(self) -> &'static [&'static str] {
        self.0.effort_levels()
    }

    /// Default reasoning effort for this provider. See
    /// [`ProviderAdapter::default_effort`].
    pub fn default_effort(self) -> Option<&'static str> {
        self.0.default_effort()
    }
}

impl From<&'static dyn ProviderAdapter> for Provider {
    fn from(adapter: &'static dyn ProviderAdapter) -> Self {
        Provider(adapter)
    }
}

impl Default for Provider {
    fn default() -> Self {
        default_provider()
    }
}

impl fmt::Debug for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("Provider").field(&self.0.id()).finish()
    }
}

impl fmt::Display for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0.id())
    }
}

impl PartialEq for Provider {
    fn eq(&self, other: &Self) -> bool {
        self.0.id() == other.0.id()
    }
}

impl Eq for Provider {}

impl std::hash::Hash for Provider {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.id().hash(state);
    }
}

impl FromStr for Provider {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        get(s)
            .map(Provider)
            .ok_or_else(|| format!("Unknown provider: {s}"))
    }
}

impl Serialize for Provider {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(self.0.id())
    }
}

impl<'de> Deserialize<'de> for Provider {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let s = String::deserialize(de)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_ids() {
        assert_eq!(Provider::from_str("anthropic").unwrap().id(), "anthropic");
        assert_eq!(Provider::from_str("openai").unwrap().id(), "openai");
    }

    #[test]
    fn parse_aliases() {
        assert_eq!(Provider::from_str("claude").unwrap().id(), "anthropic");
        assert_eq!(Provider::from_str("codex").unwrap().id(), "openai");
    }

    #[test]
    fn parse_is_case_insensitive() {
        assert_eq!(Provider::from_str("Anthropic").unwrap().id(), "anthropic");
        assert_eq!(Provider::from_str("OPENAI").unwrap().id(), "openai");
    }

    #[test]
    fn parse_rejects_unknown_provider() {
        assert!(Provider::from_str("nonexistent-provider").is_err());
    }

    #[test]
    fn display_renders_id() {
        let p = Provider::from_str("anthropic").unwrap();
        assert_eq!(p.to_string(), "anthropic");
    }

    #[test]
    fn serializes_as_id_string() {
        let p = Provider::from_str("openai").unwrap();
        let s = serde_json::to_string(&p).unwrap();
        assert_eq!(s, "\"openai\"");
    }

    #[test]
    fn deserializes_from_id_string() {
        let p: Provider = serde_json::from_str("\"anthropic\"").unwrap();
        assert_eq!(p.id(), "anthropic");
    }

    #[test]
    fn equality_is_by_id() {
        let a1 = Provider::from_str("anthropic").unwrap();
        let a2 = Provider::from_str("claude").unwrap();
        assert_eq!(a1, a2);
        let o = Provider::from_str("openai").unwrap();
        assert_ne!(a1, o);
    }

    #[test]
    fn default_is_anthropic() {
        assert_eq!(Provider::default().id(), "anthropic");
    }

    #[test]
    fn registry_contains_known_providers() {
        let ids: Vec<&str> = all().iter().map(|a| a.id()).collect();
        assert!(ids.contains(&"anthropic"));
        assert!(ids.contains(&"openai"));
        assert!(ids.contains(&"gemini"));
    }

    #[test]
    fn parse_gemini_alias() {
        assert_eq!(Provider::from_str("gemini").unwrap().id(), "gemini");
        assert_eq!(Provider::from_str("google").unwrap().id(), "gemini");
    }

    #[test]
    fn effort_levels_are_provider_specific() {
        let anthropic = Provider::from_str("anthropic").unwrap();
        let openai = Provider::from_str("openai").unwrap();
        let gemini = Provider::from_str("gemini").unwrap();

        // Claude `--effort` accepts the full range (Opus 4.7/4.8); Claude
        // self-clamps unsupported values per model.
        assert_eq!(
            anthropic.effort_levels().to_vec(),
            vec!["low", "medium", "high", "xhigh", "max"]
        );
        // Codex `model_reasoning_effort` has no `max` variant — including it
        // would be an "unknown variant" error with no CLI-side fallback.
        assert_eq!(
            openai.effort_levels().to_vec(),
            vec!["low", "medium", "high", "xhigh"]
        );
        // Gemini CLI takes no effort flag.
        assert!(gemini.effort_levels().is_empty());

        // Every provider default must be a member of its own level set, and
        // providers without effort control must have no default.
        for p in [anthropic, openai] {
            let d = p.default_effort().expect("effort provider has a default");
            assert!(
                p.effort_levels().contains(&d),
                "{p} default {d} not in its effort_levels"
            );
        }
        assert!(gemini.default_effort().is_none());
    }

    #[test]
    fn device_login_args_only_for_openai() {
        // Only codex needs a distinct headless flow — plain `codex login`
        // uses a localhost loopback redirect that can't reach a remote
        // engine. Claude's standard login already works headless (paste-back
        // code) and Gemini drives its own browser identity, so neither
        // exposes a device variant.
        let openai = Provider::from_str("openai").unwrap();
        assert_eq!(
            openai.device_login_args().map(|a| a.to_vec()),
            Some(vec!["login", "--device-auth", "-c", "model_reasoning_effort=high"])
        );
        assert!(Provider::from_str("anthropic")
            .unwrap()
            .device_login_args()
            .is_none());
        assert!(Provider::from_str("gemini")
            .unwrap()
            .device_login_args()
            .is_none());
    }
}
