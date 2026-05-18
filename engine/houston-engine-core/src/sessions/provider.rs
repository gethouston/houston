//! Provider + model resolution for a session.
//!
//! Priority: agent-level `.houston/config/config.json` → workspace entry in
//! `workspaces.json` → default Anthropic. Callers typically pass chat-level
//! overrides in front of this resolution chain.

use crate::paths::EnginePaths;
use crate::workspaces;
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
/// 1. `agent_dir/.houston/config/config.json` — per-agent override.
/// 2. Workspace entry (workspace dir = parent of agent dir, workspaces root =
///    parent of workspace dir OR `paths.docs()`).
/// 3. `Provider::default()` (Anthropic), no model (factory default).
pub fn resolve_provider(paths: &EnginePaths, agent_dir: &Path) -> ResolvedProvider {
    if let Some(from_agent) = read_agent_config(agent_dir) {
        // Agent-level config exists — but model can come from workspace if
        // the agent only overrides one field. Match the old Tauri behavior.
        if let Some(ref p_str) = from_agent.provider {
            if let Ok(provider) = p_str.parse::<Provider>() {
                return ResolvedProvider {
                    provider,
                    model: from_agent.model.clone(),
                };
            }
        }
        if from_agent.model.is_some() {
            let ws = resolve_workspace(paths, agent_dir);
            return ResolvedProvider {
                provider: ws.provider,
                model: from_agent.model,
            };
        }
    }
    resolve_workspace(paths, agent_dir)
}

fn read_agent_config(agent_dir: &Path) -> Option<AgentConfig> {
    let path = agent_dir.join(".houston/config/config.json");
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&raw).ok()
}

fn resolve_workspace(paths: &EnginePaths, agent_dir: &Path) -> ResolvedProvider {
    let Some(workspace_dir) = agent_dir.parent() else {
        return ResolvedProvider::default();
    };
    let ws_name = match workspace_dir.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return ResolvedProvider::default(),
    };
    // Workspaces root is `paths.docs()` or the workspace's parent (matches
    // adapter behavior when the agent lives under a non-standard location).
    let roots = [workspace_dir.parent(), Some(paths.docs())];
    for root in roots.iter().flatten() {
        let all = match workspaces::read_all(root) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(ws) = all.iter().find(|w| w.name == ws_name) {
            let provider = ws
                .provider
                .as_deref()
                .and_then(|p| p.parse::<Provider>().ok())
                .unwrap_or_default();
            return ResolvedProvider {
                provider,
                model: ws.model.clone(),
            };
        }
    }
    ResolvedProvider::default()
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
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
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
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn workspace_fallback() {
        let d = TempDir::new().unwrap();
        let workspaces_json = d.path().join("workspaces.json");
        write_json(
            &workspaces_json,
            r#"[{"id":"x","name":"ws","isDefault":true,"createdAt":"t","provider":"openai","model":"gpt-5"}]"#,
        );
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("gpt-5"));
    }

    #[test]
    fn agent_model_only_uses_workspace_provider() {
        let d = TempDir::new().unwrap();
        write_json(
            &d.path().join("workspaces.json"),
            r#"[{"id":"x","name":"ws","isDefault":true,"createdAt":"t","provider":"openai"}]"#,
        );
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".houston/config/config.json"),
            r#"{"model":"sonnet"}"#,
        );
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, openai());
        assert_eq!(r.model.as_deref(), Some("sonnet"));
    }
}
