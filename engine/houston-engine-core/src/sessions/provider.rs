//! Provider + model resolution for a session.
//!
//! Resolution (no caller override): agent-level `.houston/config/config.json`
//! → user's last-used provider preference (`default_provider`) → the sole
//! authenticated provider → `Provider::default()` (Anthropic factory default).
//! Callers typically pass chat-level overrides in front of this chain.
//!
//! The point of the preference + auth-aware tail (vs. hardcoding Anthropic) is
//! that an OpenAI-only user with an agent that has no provider configured
//! (Store install, hand-edited config, a routine, a Mission-Control send with
//! no override) must never spawn the Claude CLI, which would only fail auth
//! (#483). We trust an explicit last-used preference as the user's choice and
//! probe live auth only when no preference exists — so the desktop hot path
//! (always post-onboarding, always with a preference) never spawns a CLI here,
//! and the override-less engine paths (routines, onboarding, summarize,
//! generate-instructions) still resolve to a provider the user can actually run.
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
/// 1. `agent_dir/.houston/config/config.json` — per-agent `provider`.
/// 2. [`fallback_provider`] — last-used preference → sole authed → factory
///    default — when the agent config names no provider.
///
/// The model is always the agent config's (if any); when we fall back for the
/// provider, the model stays `None` so the runner uses that provider's default.
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
    ResolvedProvider {
        provider,
        model: from_agent.and_then(|c| c.model),
    }
}

/// Pick the provider to run when nothing explicit (override or agent config)
/// names one.
///
/// 1. The user's last-used provider preference (`default_provider`, written by
///    `setLastUsed` on every provider pick). Trusted as the user's choice even
///    if that provider isn't currently authenticated — the auth-fail UX is
///    handled elsewhere (#482), and second-guessing an explicit choice on the
///    hot send path would mean probing CLIs on every turn.
/// 2. The sole authenticated provider, probed only when there is no preference
///    (a headless / Always-On engine that never had a UI write one). One
///    authenticated provider → use it; zero or many → ambiguous.
/// 3. `Provider::default()` (Anthropic) — the historical factory default.
pub async fn fallback_provider(db: &Database) -> Provider {
    if let Some(p) = last_used_provider(db).await {
        return p;
    }
    choose_when_no_pref(&authenticated_providers().await)
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
                tracing::warn!(
                    "[provider] auth probe failed for {}: {e}",
                    provider.id()
                );
            }
        }
    }
    authed
}

/// Pure decision for the no-preference case: the sole authenticated provider,
/// else the Anthropic factory default. Split out so it is unit-testable without
/// probing the host's real CLIs.
fn choose_when_no_pref(authenticated: &[Provider]) -> Provider {
    match authenticated {
        [only] => *only,
        _ => Provider::default(),
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
///    one provider but not another (e.g. `max` on Codex, or a hand-edited
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

    // ── Pure no-preference tail (hermetic: never probes the host) ──────────

    #[test]
    fn choose_when_no_pref_no_auth_uses_factory_default() {
        assert_eq!(choose_when_no_pref(&[]), anthropic());
    }

    #[test]
    fn choose_when_no_pref_sole_authed_wins() {
        assert_eq!(choose_when_no_pref(&[openai()]), openai());
    }

    #[test]
    fn choose_when_no_pref_ambiguous_falls_to_factory_default() {
        // Two authenticated providers is ambiguous → don't guess, take the
        // factory default rather than silently picking one.
        assert_eq!(choose_when_no_pref(&[openai(), gemini()]), anthropic());
    }

    // ── resolve_provider fallback (driven by the preference, hermetic) ─────

    #[tokio::test]
    async fn no_agent_config_uses_last_used_preference() {
        // The OpenAI-only user's fix: an agent with no provider config resolves
        // to their last-used provider, NOT the Anthropic factory default.
        let db = mem_db().await;
        set_pref(&db, "openai").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let r = resolve_provider(&db, &agent).await;
        assert_eq!(r.provider, openai());
        assert!(r.model.is_none());
    }

    #[tokio::test]
    async fn empty_config_falls_through_to_preference() {
        let db = mem_db().await;
        set_pref(&db, "openai").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), "{}");
        let r = resolve_provider(&db, &agent).await;
        assert_eq!(r.provider, openai());
        assert!(r.model.is_none());
    }

    #[tokio::test]
    async fn agent_config_wins_over_preference() {
        // An explicit agent provider is the user's choice and short-circuits the
        // fallback — the preference (openai) must not override it.
        let db = mem_db().await;
        set_pref(&db, "openai").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"provider":"anthropic","model":"claude-opus-4-7"}"#,
        );
        let r = resolve_provider(&db, &agent).await;
        assert_eq!(r.provider, anthropic());
        assert_eq!(r.model.as_deref(), Some("claude-opus-4-7"));
    }

    #[tokio::test]
    async fn agent_model_only_uses_preference_provider() {
        // With workspace fallback retired, an agent that only stores `model`
        // (no provider) takes the fallback provider — now the last-used
        // preference, not a hardcoded Anthropic. Migration backfills concrete
        // provider+model pairs, so this branch is reachable only for
        // hand-edited configs.
        let db = mem_db().await;
        set_pref(&db, "openai").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), r#"{"model":"sonnet"}"#);
        let r = resolve_provider(&db, &agent).await;
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("sonnet"));
    }

    #[tokio::test]
    async fn reads_folder_config_not_stale_flat() {
        // After the per-type-folder migration the authoritative model lives in
        // `.houston/config/config.json`. A stale legacy FLAT `.houston/config.json`
        // left behind as a rollback net (still holding the pre-migration alias)
        // must never be read, so the migrated explicit ID always wins.
        let db = mem_db().await;
        set_pref(&db, "anthropic").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config.json"), r#"{"model":"opus"}"#);
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"model":"claude-opus-4-7"}"#,
        );
        let r = resolve_provider(&db, &agent).await;
        assert_eq!(r.model.as_deref(), Some("claude-opus-4-7"));
    }

    fn agent_with(body: &str) -> (TempDir, std::path::PathBuf) {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), body);
        (d, agent)
    }

    #[test]
    fn effort_uses_configured_value_when_provider_accepts_it() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","effort":"high"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("high"));
    }

    #[test]
    fn effort_accepts_max_on_claude_but_clamps_on_codex() {
        // `max` is valid for Claude; for Codex it is an unknown variant, so
        // the configured value is dropped in favor of the provider default.
        let (_d, agent) = agent_with(r#"{"effort":"max"}"#);
        assert_eq!(resolve_effort(&agent, anthropic()).as_deref(), Some("max"));
        assert_eq!(resolve_effort(&agent, openai()).as_deref(), Some("medium"));
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
