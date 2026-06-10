//! Provider + model resolution for a session.
//!
//! Resolution: agent-level `.houston/config/config.json` → `Provider::default()`
//! (Anthropic, no model). Callers typically pass chat-level overrides in
//! front of this resolution chain.
//!
//! The workspace layer used to live here as an intermediate fallback. It was
//! retired in favor of per-agent storage — see
//! `workspaces::migrate_workspace_provider_into_agents` for the one-shot
//! backfill that pushed every workspace default down into its agents.

use houston_terminal_manager::Provider;
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    pub provider: Provider,
    pub model: Option<String>,
}

impl Default for ResolvedProvider {
    fn default() -> Self {
        Self {
            provider: Provider::default(),
            model: None,
        }
    }
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
/// 1. `agent_dir/.houston/config/config.json` — per-agent setting.
/// 2. `Provider::default()` (Anthropic), no model — factory fallback.
pub fn resolve_provider(agent_dir: &Path) -> ResolvedProvider {
    let Some(from_agent) = read_agent_config(agent_dir) else {
        return ResolvedProvider::default();
    };
    let provider = from_agent
        .provider
        .as_deref()
        .and_then(|p| p.parse::<Provider>().ok())
        .unwrap_or_default();
    ResolvedProvider {
        provider,
        model: from_agent.model,
    }
}

/// Resolve provider + model, letting explicit overrides win over the agent's
/// stored config — the shared precedence used by both a chat turn (request
/// overrides) and a routine run (per-routine overrides).
///
/// Order:
/// 1. `provider_override` (a provider id like `"openai"`) + `model_override`,
///    when a provider override is present.
/// 2. Otherwise [`resolve_provider`] (agent config → Anthropic default), with
///    `model_override` applied on top if given.
///
/// A `provider_override` that doesn't name a known provider is returned as
/// `Err(message)` so the caller can surface it (a bad chat request → 400; a
/// bad routine → a visible run error). It is never silently dropped.
pub fn resolve_provider_with_overrides(
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
    let mut resolved = resolve_provider(agent_dir);
    if let Some(m) = model_override {
        resolved.model = Some(m);
    }
    Ok(resolved)
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

    #[test]
    fn default_when_no_config() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let r = resolve_provider(&agent);
        assert_eq!(r.provider, anthropic());
        assert!(r.model.is_none());
    }

    #[test]
    fn empty_config_falls_through_to_default() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), "{}");
        let r = resolve_provider(&agent);
        assert_eq!(r.provider, anthropic());
        assert!(r.model.is_none());
    }

    #[test]
    fn agent_config_wins() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"provider":"openai","model":"gpt-5.5"}"#,
        );
        let r = resolve_provider(&agent);
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn agent_model_only_uses_default_provider() {
        // With workspace fallback retired, an agent that only stores `model`
        // gets the platform-default provider (no longer the workspace's).
        // Migration backfills concrete provider+model pairs, so this branch
        // is reachable only for hand-edited configs.
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), r#"{"model":"sonnet"}"#);
        let r = resolve_provider(&agent);
        assert_eq!(r.provider, anthropic());
        assert_eq!(r.model.as_deref(), Some("sonnet"));
    }

    #[test]
    fn reads_folder_config_not_stale_flat() {
        // After the per-type-folder migration the authoritative model lives in
        // `.houston/config/config.json`. A stale legacy FLAT `.houston/config.json`
        // left behind as a rollback net (still holding the pre-migration alias)
        // must never be read, so the migrated explicit ID always wins.
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config.json"), r#"{"model":"opus"}"#);
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"model":"claude-opus-4-7"}"#,
        );
        let r = resolve_provider(&agent);
        assert_eq!(r.model.as_deref(), Some("claude-opus-4-7"));
    }

    fn agent_with(body: &str) -> (TempDir, std::path::PathBuf) {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(&agent.join(".houston/config/config.json"), body);
        (d, agent)
    }

    #[test]
    fn overrides_win_over_agent_config() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic","model":"sonnet"}"#);
        let r = resolve_provider_with_overrides(&agent, Some("openai"), Some("gpt-5.5".into()))
            .unwrap();
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn no_override_falls_back_to_agent_config() {
        let (_d, agent) = agent_with(r#"{"provider":"openai","model":"gpt-5.5"}"#);
        let r = resolve_provider_with_overrides(&agent, None, None).unwrap();
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn model_override_alone_keeps_agent_provider() {
        let (_d, agent) = agent_with(r#"{"provider":"openai","model":"gpt-5.5"}"#);
        let r = resolve_provider_with_overrides(&agent, None, Some("gpt-6".into())).unwrap();
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-6"));
    }

    #[test]
    fn bad_provider_override_errors_rather_than_silently_defaulting() {
        let (_d, agent) = agent_with(r#"{"provider":"anthropic"}"#);
        assert!(resolve_provider_with_overrides(&agent, Some("nonsense"), None).is_err());
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
        // "max" is invalid for Codex → the override is dropped and the agent's
        // configured/default effort is used instead.
        let (_d, agent) = agent_with(r#"{"provider":"openai","effort":"high"}"#);
        assert_eq!(
            resolve_effort_with_override(&agent, openai(), Some("max")).as_deref(),
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
