//! Controlled file gateway wiring for restricted agents.
//!
//! The engine writes a per-session Claude MCP config that launches the
//! `houston-engine mcp-agent-files` stdio server. The server applies the same
//! `.houston/policy.json` boundary as the REST file browser, so restricted
//! agents access files through Houston instead of native filesystem tools.

use crate::agent_policy::{AgentPolicy, ToolMode};
use crate::error::{CoreError, CoreResult};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct McpConfig {
    #[serde(rename = "mcpServers")]
    servers: BTreeMap<String, McpServer>,
}

#[derive(Serialize)]
struct McpServer {
    command: String,
    args: Vec<String>,
}

pub fn prepare_mcp_config(
    agent_root: &Path,
    session_key: &str,
    policy: &AgentPolicy,
) -> CoreResult<Option<PathBuf>> {
    if !matches!(policy.tool_mode, ToolMode::Restricted) {
        return Ok(None);
    }

    let exe = std::env::current_exe()
        .map_err(|e| CoreError::Internal(format!("failed to resolve engine binary: {e}")))?;
    let cache_dir = houston_db::db::houston_dir().join("cache").join("mcp");
    std::fs::create_dir_all(&cache_dir)?;
    let agent_tag = agent_root
        .file_name()
        .map(|n| safe_session_key(&n.to_string_lossy()))
        .unwrap_or_else(|| "agent".to_string());
    let path = cache_dir.join(format!(
        "houston-files-{}-{}.mcp.json",
        agent_tag,
        safe_session_key(session_key)
    ));

    let mut servers = BTreeMap::new();
    servers.insert(
        "houston_files".to_string(),
        McpServer {
            command: exe.to_string_lossy().to_string(),
            args: vec![
                "mcp-agent-files".to_string(),
                "--agent-root".to_string(),
                agent_root.to_string_lossy().to_string(),
            ],
        },
    );
    let json = serde_json::to_string_pretty(&McpConfig { servers })?;
    std::fs::write(&path, json)?;
    Ok(Some(path))
}

/// Remove MCP config files older than 24h from the home cache. Best-effort:
/// a session writes a fresh config each turn, so old ones are disposable.
pub fn cleanup_stale_configs() {
    let dir = houston_db::db::houston_dir().join("cache").join("mcp");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(24 * 3600);
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| t < cutoff)
            .unwrap_or(false);
        if stale {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                tracing::warn!("[file_gateway] failed to remove stale mcp config: {e}");
            }
        }
    }
}

fn safe_session_key(session_key: &str) -> String {
    session_key
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn restricted_policy_writes_config_outside_agent_root() {
        let d = TempDir::new().unwrap();
        let agent_root = d.path().join("workspaces/Personal/Finance");
        std::fs::create_dir_all(&agent_root).unwrap();
        let path = prepare_mcp_config(&agent_root, "session/1", &AgentPolicy::default())
            .unwrap()
            .expect("restricted agent should get gateway config");
        assert!(
            !path.starts_with(&agent_root),
            "mcp config {} must live outside the agent root",
            path.display()
        );
        assert!(path.exists());
    }

    #[test]
    fn cleanup_is_safe_and_idempotent() {
        cleanup_stale_configs();
        cleanup_stale_configs();
    }

    #[test]
    fn non_restricted_policy_skips_mcp_config() {
        let d = TempDir::new().unwrap();
        let policy = AgentPolicy {
            tool_mode: ToolMode::Full,
            ..AgentPolicy::default()
        };
        assert!(prepare_mcp_config(d.path(), "s", &policy).unwrap().is_none());
    }
}
