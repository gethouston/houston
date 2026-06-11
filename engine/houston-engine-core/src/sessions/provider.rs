//! Provider + model resolution for a session.
//!
//! Resolution starts from the most specific signal — the agent's
//! `.houston/config/config.json` `provider`, else the user's last-used
//! preference (`default_provider`), else the Anthropic factory default — and is
//! then **auth-gated** per [`ResolveMode`]. (Callers still pass per-chat
//! overrides in front of this whole chain.)
//!
//! - [`ResolveMode::Unattended`] (routines, onboarding, title summaries):
//!   auth-gate *everything*, including an explicit agent config. There is no one
//!   present to click "reconnect", so a Claude-configured routine run while only
//!   OpenAI is connected switches to OpenAI rather than failing auth unattended
//!   (#483). On a switch the configured model is dropped (a Claude model id
//!   can't run on Codex) and the new provider's default is used.
//! - [`ResolveMode::Interactive`] (a chat send with no override): honor an
//!   explicit agent provider as-is — never silently move the user to a different
//!   model mid-conversation. A logged-out configured provider instead surfaces
//!   the reconnect card. Only the no-config fallback is auth-gated (picking an
//!   authenticated provider for a never-configured agent is initial selection,
//!   not a switch).
//!
//! The gate only changes anything when the desired provider is logged out;
//! otherwise it is used unchanged. Live auth is probed only when the gate can
//! act, so an Interactive resolve of an explicitly-configured agent never spawns
//! a CLI here.
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

/// How aggressively [`resolve_provider`] auth-gates an *explicit* agent config.
/// The no-config fallback is auth-gated either way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolveMode {
    /// Interactive chat (a send with no override): honor an explicit agent
    /// provider as-is even when it's logged out — a reconnect card handles that.
    /// Never silently switch provider mid-conversation.
    Interactive,
    /// Unattended (routines, onboarding, title summaries): auth-gate an explicit
    /// provider too, so a logged-out configured provider is switched to one the
    /// user can actually run instead of failing with no one there to fix it
    /// (#483).
    Unattended,
}

/// Resolve the provider + model for an agent. See [`ResolveMode`] and the module
/// docs for the auth-gating rules. When auth-gating switches off the configured
/// provider, the configured model is dropped ([`model_for`]).
pub async fn resolve_provider(
    db: &Database,
    agent_dir: &Path,
    mode: ResolveMode,
) -> ResolvedProvider {
    let from_agent = read_agent_config(agent_dir);
    let configured = from_agent
        .as_ref()
        .and_then(|c| c.provider.as_deref())
        .and_then(|p| p.parse::<Provider>().ok());
    let provider = match (configured, mode) {
        // Chat: explicit provider honored as-is; a logged-out one surfaces the
        // reconnect card rather than a silent mid-conversation switch.
        (Some(p), ResolveMode::Interactive) => p,
        // Unattended: auth-gate the explicit provider too.
        (Some(p), ResolveMode::Unattended) => {
            choose_fallback(Some(p), &authenticated_providers().await)
        }
        // No configured provider: auth-gate the preference/default in both modes
        // (initial selection for a never-configured agent, not a mid-chat switch).
        (None, _) => {
            choose_fallback(last_used_provider(db).await, &authenticated_providers().await)
        }
    };
    let model = model_for(configured, provider, from_agent.and_then(|c| c.model));
    ResolvedProvider { provider, model }
}

/// Keep the agent's configured model only when the final provider is the one it
/// was configured for. Auth-gating can switch us off the configured provider,
/// and a provider can't run another provider's model id (a Claude model on
/// Codex), so on a switch we drop it and let the runner use the new provider's
/// default. Pure + unit-testable.
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

/// Pick the provider to run when nothing explicit (override or agent config)
/// names one. **Auth-gated**: never returns a provider the user is logged out
/// of while another is available.
///
/// Probes live auth (only reached on override-less engine paths, so off the
/// desktop hot path) and defers the decision to [`choose_fallback`]:
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
                tracing::warn!(
                    "[provider] auth probe failed for {}: {e}",
                    provider.id()
                );
            }
        }
    }
    authed
}

/// Pure fallback decision, split out so it is unit-testable without probing the
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

    // ── Pure auth-gated fallback decision (hermetic: never probes host) ────

    #[test]
    fn choose_fallback_uses_preferred_when_authenticated() {
        // Logged into both; the preferred (last-used openai) is honored — so a
        // user logged into both doesn't regress to Anthropic.
        assert_eq!(
            choose_fallback(Some(openai()), &[anthropic(), openai()]),
            openai(),
        );
    }

    #[test]
    fn choose_fallback_defaults_to_anthropic_when_no_preference() {
        // No preference, Anthropic authenticated → the factory default.
        assert_eq!(choose_fallback(None, &[anthropic(), openai()]), anthropic());
    }

    #[test]
    fn choose_fallback_switches_when_preferred_is_logged_out() {
        // The stale-preference fix: last-used says Anthropic but the user is only
        // logged into OpenAI → use OpenAI, never spawn the logged-out Claude CLI.
        assert_eq!(choose_fallback(Some(anthropic()), &[openai()]), openai());
    }

    #[test]
    fn choose_fallback_picks_sole_authed_when_no_preference() {
        // The OpenAI-only user with no preference: the one provider they are
        // logged into wins over the Anthropic factory default.
        assert_eq!(choose_fallback(None, &[openai()]), openai());
    }

    #[test]
    fn choose_fallback_keeps_preferred_when_nothing_authenticated() {
        // Nothing connected → still choose *some* provider (the preferred one) so
        // the auth-failure UX can take over instead of resolving to nonsense.
        assert_eq!(choose_fallback(Some(openai()), &[]), openai());
        assert_eq!(choose_fallback(None, &[]), anthropic());
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

    // ── Model drop on auth-switch (pure, hermetic) ─────────────────────────

    #[test]
    fn model_for_keeps_configured_model_when_provider_unchanged() {
        assert_eq!(
            model_for(Some(anthropic()), anthropic(), Some("claude-opus-4-7".into())).as_deref(),
            Some("claude-opus-4-7"),
        );
    }

    #[test]
    fn model_for_drops_model_when_auth_switched_provider() {
        // Configured for Claude but auth-gated onto OpenAI: a Claude model id
        // can't run on Codex, so drop it and let the runner use the default.
        assert_eq!(
            model_for(Some(anthropic()), openai(), Some("claude-opus-4-7".into())),
            None,
        );
    }

    #[test]
    fn model_for_drops_model_when_no_configured_provider() {
        // Model present but no configured provider (hand-edited): the model isn't
        // tied to the resolved provider, so don't risk handing it to the wrong CLI.
        assert_eq!(model_for(None, anthropic(), Some("sonnet".into())), None);
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

    // ── Interactive (chat) honors explicit config (hermetic: no auth probe) ─

    #[tokio::test]
    async fn interactive_honors_explicit_config_and_never_probes() {
        // Chat: an explicit agent provider is used as-is regardless of the
        // last-used preference and WITHOUT probing live auth — a logged-out one
        // surfaces the reconnect card instead of a silent switch. (Unattended
        // auth-gating of an explicit provider is covered by `choose_fallback_*`.)
        let db = mem_db().await;
        set_pref(&db, "openai").await;
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"provider":"anthropic","model":"claude-opus-4-7"}"#,
        );
        let r = resolve_provider(&db, &agent, ResolveMode::Interactive).await;
        assert_eq!(r.provider, anthropic());
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
