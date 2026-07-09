//! Provider + model resolution for a session.
//!
//! Resolution honors the most specific *explicit* signal and only auth-gates the
//! no-config fallback:
//!
//! 1. A caller override — a chat request's provider, or a routine's pinned
//!    provider ([`resolve_provider_with_overrides`]). Honored as-is.
//! 2. The agent's `.houston/config/config.json` `provider`. Honored as-is.
//! 3. When neither names a provider, [`fallback_provider`] picks an
//!    **authenticated** one: the user's last-used provider (`default_provider`)
//!    if logged in, else whichever provider they ARE logged into, else the
//!    Anthropic factory default. This is what stops an OpenAI-only user with an
//!    agent that has no provider configured (Store install, blank/hand-edited
//!    config) from spawning the Claude CLI just to fail auth (#483).
//!
//! An explicit choice is never auth-overridden: if you configured an agent (or a
//! routine) for Claude and you're logged out, that surfaces as a reconnect card
//! (chat) or a visible run error (routine) — we do NOT silently switch you to a
//! different provider + model. Live auth is therefore probed only on the no-config
//! fallback, never when an override or agent provider is present.
//!
//! The workspace layer used to live here as an intermediate fallback. It was
//! retired in favor of per-agent storage — see
//! `workspaces::migrate_workspace_provider_into_agents` for the one-shot
//! backfill that pushed every workspace default down into its agents.

use crate::provider::DEFAULT_PROVIDER_KEY;
use houston_db::Database;
use houston_terminal_manager::Provider;
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    pub provider: Provider,
    pub model: Option<String>,
}

#[derive(Deserialize)]
struct AgentConfig {
    #[serde(default)]
    provider: Option<String>,
    #[serde(default, alias = "claude_model")]
    model: Option<String>,
    #[serde(default, alias = "claude_effort")]
    effort: Option<String>,
}

/// Resolve the provider + model for an agent.
///
/// Order:
/// 1. `agent_dir/.houston/config/config.json` `provider` — honored as-is.
/// 2. [`fallback_provider`] — an authenticated provider — when the agent config
///    names no provider.
///
/// The configured model is kept only when the final provider is the one it was
/// configured for ([`model_for`]); the no-config fallback drops it so the runner
/// uses the chosen provider's default rather than risk a cross-provider model id.
pub async fn resolve_provider(db: &Database, agent_dir: &Path) -> ResolvedProvider {
    let from_agent = read_agent_config(agent_dir);
    let configured = from_agent
        .as_ref()
        .and_then(|c| c.provider.as_deref())
        .and_then(|p| p.parse::<Provider>().ok());
    let provider = match configured {
        Some(p) => p,
        None => fallback_provider(db).await,
    };
    let model = model_for(configured, provider, from_agent.and_then(|c| c.model));
    ResolvedProvider { provider, model }
}

/// Resolve provider + model, letting explicit overrides win over the agent's
/// stored config — the shared precedence used by both a chat turn (request
/// overrides) and a routine run (per-routine overrides).
///
/// Order:
/// 1. `provider_override` (a provider id like `"openai"`) + `model_override`,
///    when a provider override is present — honored as-is, never auth-gated.
/// 2. Otherwise [`resolve_provider`] (agent config → authenticated fallback),
///    with `model_override` applied on top if given.
///
/// A `provider_override` that doesn't name a known provider is returned as
/// `Err(message)` so the caller can surface it (a bad chat request → 400; a bad
/// routine → a visible run error). It is never silently dropped.
pub async fn resolve_provider_with_overrides(
    db: &Database,
    agent_dir: &Path,
    provider_override: Option<&str>,
    model_override: Option<String>,
) -> Result<ResolvedProvider, String> {
    if let Some(p_str) = provider_override {
        let provider: Provider = p_str.parse()?;
        return Ok(ResolvedProvider {
            provider,
            model: model_override,
        });
    }
    let mut resolved = resolve_provider(db, agent_dir).await;
    if let Some(m) = model_override {
        resolved.model = Some(m);
    }
    Ok(resolved)
}

/// Pick the provider to run when nothing explicit (override or agent config)
/// names one. **Auth-gated**: never returns a provider the user is logged out of
/// while another is available.
///
/// Probes live auth (only reached on the no-config fallback, so off the explicit
/// chat/routine paths) and defers to [`choose_fallback`]:
/// preferred-if-authenticated → any authenticated provider → preferred.
pub async fn fallback_provider(db: &Database) -> Provider {
    let preferred = last_used_provider(db).await;
    let authenticated = authenticated_providers().await;
    choose_fallback(preferred, &authenticated)
}

/// Read + parse the `default_provider` preference. `None` when unset, blank, or
/// naming a provider this build doesn't recognize.
async fn last_used_provider(db: &Database) -> Option<Provider> {
    crate::preferences::get(db, DEFAULT_PROVIDER_KEY)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| s.parse::<Provider>().ok())
}

/// Probe every registered provider and collect the authenticated ones. A probe
/// error (CLI hiccup) is logged and skipped rather than aborting the sweep — a
/// best-effort signal, not a user-initiated action to surface.
async fn authenticated_providers() -> Vec<Provider> {
    let mut authed = Vec::new();
    for adapter in houston_terminal_manager::provider::all() {
        let provider = Provider::from(*adapter);
        match crate::provider::check_status(provider).await {
            Ok(status) if status.auth_state.is_authenticated() => authed.push(provider),
            Ok(_) => {}
            Err(e) => {
                tracing::warn!("[provider] auth probe failed for {}: {e}", provider.id());
            }
        }
    }
    authed
}

/// Pure no-config decision, split out so it is unit-testable without probing the
/// host's real CLIs.
///
/// - `preferred` is the user's last-used provider (`None` → the Anthropic
///   factory default).
/// - Use `preferred` when it is authenticated.
/// - Otherwise switch to a provider the user is actually logged into (registry
///   order; for the two-provider reality this is simply the other one).
/// - When nothing is authenticated, return `preferred` anyway so *some* provider
///   is chosen and the auth-failure UX can take over.
fn choose_fallback(preferred: Option<Provider>, authenticated: &[Provider]) -> Provider {
    let preferred = preferred.unwrap_or_default();
    if authenticated.contains(&preferred) {
        return preferred;
    }
    authenticated.first().copied().unwrap_or(preferred)
}

/// Keep the agent's configured model only when the final provider is the one it
/// was configured for. The no-config fallback can land on a different provider,
/// and a provider can't run another provider's model id (a Claude model on
/// Codex), so we drop it and let the runner use the new provider's default. Pure.
fn model_for(
    configured: Option<Provider>,
    final_provider: Provider,
    configured_model: Option<String>,
) -> Option<String> {
    match configured {
        Some(p) if p == final_provider => configured_model,
        _ => None,
    }
}

fn read_agent_config(agent_dir: &Path) -> Option<AgentConfig> {
    let path = agent_dir.join(".houston/config/config.json");
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&raw).ok()
}

/// Resolve the reasoning effort for a session against a *final* provider
/// (already override-resolved by the caller).
///
/// Order:
/// 1. The agent's `effort` in `config.json`, but only if the provider's CLI
///    actually accepts it ([`Provider::effort_levels`]). A value valid for
///    one provider but not another (e.g. `ultra`, or a hand-edited
///    typo) is dropped rather than passed to a CLI that would reject it.
/// 2. The provider's [`Provider::default_effort`] — the floor every session
///    gets when nothing valid is configured.
/// 3. `None` for providers with no effort control (e.g. Gemini), so the
///    runner omits the flag.
///
/// Effort is per-agent, validated against whichever provider the session
/// ends up using; callers pass the same agent dir they resolved the
/// provider from.
pub fn resolve_effort(agent_dir: &Path, provider: Provider) -> Option<String> {
    let levels = provider.effort_levels();
    if levels.is_empty() {
        return None;
    }
    let configured = read_agent_config(agent_dir).and_then(|c| c.effort);
    match configured.as_deref() {
        Some(e) if levels.iter().any(|&l| l == e) => Some(e.to_string()),
        _ => provider.default_effort().map(str::to_string),
    }
}

/// Like [`resolve_effort`] but lets a caller-supplied override (e.g. a routine's
/// pinned effort) win — *only* when the resolved provider accepts it. An
/// unsupported override (a level for a different provider, or a value the model
/// rejects) is dropped in favor of the agent's configured/default effort,
/// exactly as a hand-edited config value would be. Providers with no effort
/// control (e.g. Gemini) still yield `None`.
pub fn resolve_effort_with_override(
    agent_dir: &Path,
    provider: Provider,
    override_effort: Option<&str>,
) -> Option<String> {
    if let Some(e) = override_effort {
        let levels = provider.effort_levels();
        if !levels.is_empty() && levels.iter().any(|&l| l == e) {
            return Some(e.to_string());
        }
    }
    resolve_effort(agent_dir, provider)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_json(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn anthropic() -> Provider {
        "anthropic".parse().unwrap()
    }
    fn openai() -> Provider {
        "openai".parse().unwrap()
    }
    fn gemini() -> Provider {
        "gemini".parse().unwrap()
    }

    async fn mem_db() -> Database {
        Database::connect_in_memory().await.unwrap()
    }

    async fn set_pref(db: &Database, value: &str) {
        crate::preferences::set(db, DEFAULT_PROVIDER_KEY, value)
            .await
            .unwrap();
    }

    fn agent_with(body: &str) -> (TempDir, std::path::PathBuf) {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), body);
        (d, agent)
    }

    // ── Pure no-config decision (hermetic: never probes the host) ──────────

    #[test]
    fn choose_fallback_uses_preferred_when_authenticated() {
        // Logged into both; last-used openai is honored (no regress to Anthropic).
        assert_eq!(
            choose_fallback(Some(openai()), &[anthropic(), openai()]),
            openai(),
        );
    }

    #[test]
    fn choose_fallback_defaults_to_anthropic_when_no_preference() {
        assert_eq!(choose_fallback(None, &[anthropic(), openai()]), anthropic());
    }

    #[test]
    fn choose_fallback_switches_when_preferred_is_logged_out() {
        // last-used says Anthropic but only OpenAI is connected → OpenAI.
        assert_eq!(choose_fallback(Some(anthropic()), &[openai()]), openai());
    }

    #[test]
    fn choose_fallback_picks_sole_authed_when_no_preference() {
        assert_eq!(choose_fallback(None, &[openai()]), openai());
    }

    #[test]
    fn choose_fallback_keeps_preferred_when_nothing_authenticated() {
        assert_eq!(choose_fallback(Some(openai()), &[]), openai());
        assert_eq!(choose_fallback(None, &[]), anthropic());
    }

    // ── Model drop on a no-config switch (pure) ────────────────────────────

    #[test]
    fn model_for_keeps_configured_model_when_provider_unchanged() {
        assert_eq!(
            model_for(Some(anthropic()), anthropic(), Some("claude-opus-4-7".into())).as_deref(),
            Some("claude-opus-4-7"),
        );
    }

    #[test]
    fn model_for_drops_model_when_provider_differs() {
        assert_eq!(
            model_for(Some(anthropic()), openai(), Some("claude-opus-4-7".into())),
            None,
        );
    }

    #[test]
    fn model_for_drops_model_when_no_configured_provider() {
        assert_eq!(model_for(None, anthropic(), Some("sonnet".into())), None);
    }

    // ── Preference read (hermetic: DB only) ────────────────────────────────

    #[tokio::test]
    async fn last_used_provider_reads_pref_blank_and_garbage_as_unset() {
        let db = mem_db().await;
        assert!(last_used_provider(&db).await.is_none());
        set_pref(&db, "openai").await;
        assert_eq!(last_used_provider(&db).await, Some(openai()));
        set_pref(&db, "   ").await;
        assert!(last_used_provider(&db).await.is_none());
        set_pref(&db, "not-a-provider").await;
        assert!(last_used_provider(&db).await.is_none());
    }

    // ── Config read precedence (hermetic: no auth probe) ───────────────────

    #[test]
    fn read_agent_config_prefers_folder_over_stale_flat() {
        // After the per-type-folder migration the authoritative config lives in
        // `.houston/config/config.json`. A stale legacy FLAT `.houston/config.json`
        // left behind as a rollback net must never be read.
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config.json"), r#"{"model":"opus"}"#);
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"provider":"anthropic","model":"claude-opus-4-7"}"#,
        );
        let cfg = read_agent_config(&agent).expect("folder config parses");
        assert_eq!(cfg.provider.as_deref(), Some("anthropic"));
        assert_eq!(cfg.model.as_deref(), Some("claude-opus-4-7"));
    }

    // ── Overrides + explicit config honored without probing (hermetic) ─────

    #[tokio::test]
    async fn overrides_win_over_agent_config() {
        let db = mem_db().await;
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","model":"sonnet"}"#);
        let r = resolve_provider_with_overrides(&db, &agent, Some("openai"), Some("gpt-5.5".into()))
            .await
            .unwrap();
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[tokio::test]
    async fn no_override_honors_explicit_agent_config() {
        // Explicit agent provider is honored as-is — and probes nothing, so this
        // stays hermetic regardless of the host's real auth state.
        let db = mem_db().await;
        set_pref(&db, "openai").await; // must NOT override the explicit config
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","model":"claude-opus-4-7"}"#);
        let r = resolve_provider_with_overrides(&db, &agent, None, None)
            .await
            .unwrap();
        assert_eq!(r.provider, anthropic());
        assert_eq!(r.model.as_deref(), Some("claude-opus-4-7"));
    }

    #[tokio::test]
    async fn model_override_alone_keeps_agent_provider() {
        let db = mem_db().await;
        let (_d, agent) = agent_with(r#"{"provider":"openai","model":"gpt-5.5"}"#);
        let r = resolve_provider_with_overrides(&db, &agent, None, Some("gpt-6".into()))
            .await
            .unwrap();
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-6"));
    }

    #[tokio::test]
    async fn bad_provider_override_errors_rather_than_silently_defaulting() {
        let db = mem_db().await;
        let (_d, agent) = agent_with(r#"{"provider":"anthropic"}"#);
        assert!(
            resolve_provider_with_overrides(&db, &agent, Some("nonsense"), None)
                .await
                .is_err()
        );
    }

    // ── Effort (sync, unchanged from main) ─────────────────────────────────

    #[test]
    fn effort_uses_configured_value_when_provider_accepts_it() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","effort":"high"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("high"));
    }

    #[test]
    fn effort_accepts_max_on_both_claude_and_codex() {
        // `max` is in both providers' unions since GPT-5.6 (codex >= 0.143
        // parses it; the server/model gates whether it is honored).
        let (_d, agent) = agent_with(r#"{"effort":"max"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("max"));
        assert_eq!(resolve_effort(&agent, openai()).as_deref(), Some("max"));
    }

    #[test]
    fn effort_accepts_xhigh_on_codex() {
        let (_d, agent) = agent_with(r#"{"provider":"openai","effort":"xhigh"}"#);
        assert_eq!(resolve_effort(&agent, openai()).as_deref(), Some("xhigh"));
    }

    #[test]
    fn effort_falls_back_to_default_when_unset_or_garbage() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("medium"));

        let (_d2, agent2) = agent_with(r#"{"effort":"ultra"}"#);
        assert_eq!(resolve_effort(&agent2, anthropic()).as_deref(), Some("medium"));
    }

    #[test]
    fn effort_reads_claude_effort_alias() {
        let (_d, agent) = agent_with(r#"{"claude_effort":"xhigh"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("xhigh"));
    }

    #[test]
    fn effort_override_wins_when_provider_accepts_it() {
        // A routine pins "max"; Anthropic accepts it, so it overrides the
        // agent's configured "low".
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","effort":"low"}"#);
        assert_eq!(
            resolve_effort_with_override(&agent, anthropic(), Some("max")).as_deref(),
            Some("max")
        );
    }

    #[test]
    fn effort_override_dropped_when_provider_rejects_it() {
        // "ultra" is a GPT-5.6 harness MODE, not an effort level → the
        // override is dropped and the agent's configured effort is used.
        let (_d, agent) = agent_with(r#"{"provider":"openai","effort":"high"}"#);
        assert_eq!(
            resolve_effort_with_override(&agent, openai(), Some("ultra")).as_deref(),
            Some("high"),
        );
    }

    #[test]
    fn effort_override_none_falls_back_to_resolve_effort() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","effort":"high"}"#);
        assert_eq!(
            resolve_effort_with_override(&agent, anthropic(), None).as_deref(),
            Some("high")
        );
    }

    #[test]
    fn effort_override_ignored_for_provider_without_effort_control() {
        // Even a "valid-looking" override yields None for Gemini.
        let (_d, agent) = agent_with(r#"{"provider":"gemini"}"#);
        assert!(resolve_effort_with_override(&agent, gemini(), Some("high")).is_none());
    }

    #[test]
    fn effort_is_none_for_provider_without_effort_control() {
        // Gemini has no effort flag — even a configured value yields None.
        let (_d, agent) = agent_with(r#"{"provider":"gemini","effort":"high"}"#);
        assert!(resolve_effort(&agent, gemini()).is_none());
    }

    #[test]
    fn effort_default_when_no_config_file() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("medium"));
    }
}
