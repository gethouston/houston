//! Per-agent access policy.
//!
//! MVP scope: keep every session and Houston-managed file operation inside
//! the agent's approved roots. The policy lives in `.houston/policy.json`
//! so users and future admin UI can tighten or widen an agent without a DB
//! migration.

use crate::error::{CoreError, CoreResult};
use houston_agents_conversations::session_runner::SessionToolConfig;
use houston_engine_protocol::ErrorCode;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

pub const POLICY_PATH: &str = ".houston/policy.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolMode {
    Restricted,
    Full,
    ConversationOnly,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AgentPolicy {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_allowed_roots")]
    pub allowed_roots: Vec<String>,
    #[serde(default)]
    pub denied_roots: Vec<String>,
    #[serde(default)]
    pub include_workspace_context: bool,
    #[serde(default)]
    pub allowed_integrations: Vec<String>,
    #[serde(default)]
    pub denied_integrations: Vec<String>,
    #[serde(default)]
    pub tool_mode: ToolMode,
}

impl Default for AgentPolicy {
    fn default() -> Self {
        Self {
            version: default_version(),
            allowed_roots: default_allowed_roots(),
            denied_roots: Vec::new(),
            include_workspace_context: false,
            allowed_integrations: Vec::new(),
            denied_integrations: Vec::new(),
            tool_mode: ToolMode::Restricted,
        }
    }
}

impl Default for ToolMode {
    fn default() -> Self {
        Self::Restricted
    }
}

fn default_version() -> u32 {
    1
}

fn default_allowed_roots() -> Vec<String> {
    vec![".".to_string()]
}

pub fn forbidden(message: impl Into<String>) -> CoreError {
    CoreError::Labeled {
        code: ErrorCode::Forbidden,
        kind: "agent_policy_denied",
        message: message.into(),
    }
}

pub fn policy_path(agent_root: &Path) -> PathBuf {
    agent_root.join(POLICY_PATH)
}

pub fn load(agent_root: &Path) -> CoreResult<AgentPolicy> {
    let path = policy_path(agent_root);
    if !path.exists() {
        return Ok(AgentPolicy::default());
    }
    let contents = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&contents)?)
}

pub fn seed_if_missing(agent_root: &Path) -> CoreResult<()> {
    let path = policy_path(agent_root);
    if path.exists() {
        return Ok(());
    }
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::Internal("policy path has no parent".into()))?;
    std::fs::create_dir_all(parent)?;
    let json = serde_json::to_string_pretty(&AgentPolicy::default())?;
    std::fs::write(path, json)?;
    Ok(())
}

pub fn ensure_path_allowed(agent_root: &Path, path: &Path) -> CoreResult<()> {
    let policy = load(agent_root)?;
    policy.ensure_path_allowed(agent_root, path)
}

impl AgentPolicy {
    pub fn ensure_path_allowed(&self, agent_root: &Path, path: &Path) -> CoreResult<()> {
        let target = normalize_for_policy(path)?;
        for denied in self.resolved_denied_roots(agent_root)? {
            if target.starts_with(&denied) {
                return Err(forbidden(format!(
                    "agent policy denies access to {}",
                    target.display()
                )));
            }
        }
        for allowed in self.resolved_allowed_roots(agent_root)? {
            if target.starts_with(&allowed) {
                return Ok(());
            }
        }
        Err(forbidden(format!(
            "agent policy does not allow access to {}",
            target.display()
        )))
    }

    pub fn resolved_allowed_roots(&self, agent_root: &Path) -> CoreResult<Vec<PathBuf>> {
        self.resolve_roots(agent_root, &self.allowed_roots)
    }

    fn resolved_denied_roots(&self, agent_root: &Path) -> CoreResult<Vec<PathBuf>> {
        self.resolve_roots(agent_root, &self.denied_roots)
    }

    fn resolve_roots(&self, agent_root: &Path, roots: &[String]) -> CoreResult<Vec<PathBuf>> {
        let mut out = Vec::new();
        for root in roots {
            let raw = Path::new(root);
            let joined = if raw.is_absolute() {
                crate::paths::expand_tilde(raw)
            } else {
                agent_root.join(raw)
            };
            out.push(normalize_for_policy(&joined)?);
        }
        Ok(out)
    }
}

pub fn normalize_for_policy(path: &Path) -> CoreResult<PathBuf> {
    let expanded = crate::paths::expand_tilde(path);
    let mut clean = PathBuf::new();
    for component in expanded.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                clean.pop();
            }
            other => clean.push(other.as_os_str()),
        }
    }
    if clean.exists() {
        return std::fs::canonicalize(&clean).map_err(CoreError::Io);
    }
    let parent = clean
        .parent()
        .ok_or_else(|| CoreError::BadRequest(format!("invalid path: {}", path.display())))?;
    let canonical_parent = if parent.exists() {
        std::fs::canonicalize(parent)?
    } else {
        normalize_for_policy(parent)?
    };
    let file_name = clean
        .file_name()
        .ok_or_else(|| CoreError::BadRequest(format!("invalid path: {}", path.display())))?;
    Ok(canonical_parent.join(file_name))
}

pub fn tool_config(policy: &AgentPolicy) -> SessionToolConfig {
    match policy.tool_mode {
        ToolMode::Full => SessionToolConfig::default(),
        ToolMode::Restricted => SessionToolConfig {
            disable_builtin_tools: true,
            disable_all_tools: false,
            use_provider_sandbox: true,
        },
        ToolMode::ConversationOnly => SessionToolConfig {
            disable_builtin_tools: true,
            disable_all_tools: true,
            use_provider_sandbox: true,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn default_policy_allows_agent_root() {
        let d = TempDir::new().unwrap();
        let file = d.path().join("report.md");
        std::fs::write(&file, "x").unwrap();
        AgentPolicy::default()
            .ensure_path_allowed(d.path(), &file)
            .unwrap();
    }

    #[test]
    fn default_policy_blocks_sibling_root() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("finance");
        let sales = d.path().join("sales");
        std::fs::create_dir_all(&agent).unwrap();
        std::fs::create_dir_all(&sales).unwrap();
        let err = AgentPolicy::default()
            .ensure_path_allowed(&agent, &sales)
            .unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }

    #[test]
    fn denied_root_wins_over_allowed_root() {
        let d = TempDir::new().unwrap();
        let private = d.path().join("private");
        std::fs::create_dir_all(&private).unwrap();
        let policy = AgentPolicy {
            denied_roots: vec!["private".into()],
            ..AgentPolicy::default()
        };
        let err = policy.ensure_path_allowed(d.path(), &private).unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }

    #[test]
    fn seed_writes_default_policy_once() {
        let d = TempDir::new().unwrap();
        seed_if_missing(d.path()).unwrap();
        let first = std::fs::read_to_string(policy_path(d.path())).unwrap();
        std::fs::write(policy_path(d.path()), "{\"version\":1,\"allowed_roots\":[\"docs\"]}")
            .unwrap();
        seed_if_missing(d.path()).unwrap();
        let second = std::fs::read_to_string(policy_path(d.path())).unwrap();
        assert_ne!(first, second);
        assert!(second.contains("docs"));
    }

    #[test]
    fn restricted_policy_uses_provider_sandbox() {
        let cfg = tool_config(&AgentPolicy::default());
        assert!(cfg.disable_builtin_tools);
        assert!(!cfg.disable_all_tools);
        assert!(cfg.use_provider_sandbox);
    }
}
