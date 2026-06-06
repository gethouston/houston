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
    let dir = agent_root.join(".houston").join("runtime");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!(
        "houston-files-{}.mcp.json",
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
    fn restricted_policy_gets_mcp_config() {
        let d = TempDir::new().unwrap();
        let path = prepare_mcp_config(d.path(), "session/1", &AgentPolicy::default())
            .unwrap()
            .expect("restricted agent should get gateway config");
        assert_eq!(
            path.file_name().and_then(|n| n.to_str()),
            Some("houston-files-session_1.mcp.json")
        );
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
