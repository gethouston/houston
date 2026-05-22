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

fn read_agent_config(agent_dir: &Path) -> Option<AgentConfig> {
    let path = agent_dir.join(".houston/config/config.json");
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&raw).ok()
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
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"model":"sonnet"}"#,
        );
        let r = resolve_provider(&agent);
        assert_eq!(r.provider, anthropic());
        assert_eq!(r.model.as_deref(), Some("sonnet"));
    }
}
