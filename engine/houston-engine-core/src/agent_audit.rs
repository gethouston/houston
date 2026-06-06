//! Per-session audit log for agent filesystem/tool activity.

use crate::agent_policy::{AgentPolicy, ToolMode};
use crate::error::CoreResult;
use houston_agents_conversations::session_runner::SessionObserver;
use houston_terminal_manager::{FeedItem, FileChanges, Provider};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone)]
pub struct AgentAudit {
    agent_root: PathBuf,
    working_dir: PathBuf,
    path: PathBuf,
    policy: AgentPolicy,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccessVerdict {
    Allowed,
    Denied,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuditEvent {
    SessionStarted {
        session_key: String,
        provider: String,
        model: Option<String>,
        agent_root: String,
        working_dir: String,
        allowed_roots: Vec<String>,
        denied_roots: Vec<String>,
        tool_mode: String,
    },
    SessionId {
        provider_session_id: String,
    },
    SessionStatus {
        status: String,
        error: Option<String>,
    },
    ToolCall {
        name: String,
        input: Value,
        accesses: Vec<AuditAccess>,
    },
    FileChanges {
        created: Vec<String>,
        modified: Vec<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditAccess {
    pub raw: String,
    pub resolved: Option<String>,
    pub verdict: AccessVerdict,
    pub reason: String,
}

#[derive(Debug, Serialize)]
struct AuditLine {
    ts: String,
    event: AuditEvent,
}

impl AgentAudit {
    pub fn start(
        agent_root: &Path,
        working_dir: &Path,
        session_key: &str,
        provider: Provider,
        model: Option<&str>,
        policy: AgentPolicy,
    ) -> CoreResult<Arc<Self>> {
        let path = audit_path(agent_root, session_key);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let audit = Arc::new(Self {
            agent_root: agent_root.to_path_buf(),
            working_dir: working_dir.to_path_buf(),
            path,
            policy,
        });
        let allowed_roots = audit
            .policy
            .resolved_allowed_roots(agent_root)?
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        audit.write(AuditEvent::SessionStarted {
            session_key: session_key.to_string(),
            provider: provider.to_string(),
            model: model.map(str::to_string),
            agent_root: agent_root.to_string_lossy().to_string(),
            working_dir: working_dir.to_string_lossy().to_string(),
            allowed_roots,
            denied_roots: audit.policy.denied_roots.clone(),
            tool_mode: tool_mode_name(&audit.policy.tool_mode).to_string(),
        });
        Ok(audit)
    }

    fn write(&self, event: AuditEvent) {
        let line = AuditLine {
            ts: chrono::Utc::now().to_rfc3339(),
            event,
        };
        let Ok(json) = serde_json::to_string(&line) else {
            return;
        };
        match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            Ok(mut file) => {
                if let Err(e) = writeln!(file, "{json}") {
                    tracing::warn!("[agent_audit] failed to write audit line: {e}");
                }
            }
            Err(e) => tracing::warn!(
                "[agent_audit] failed to open audit log {}: {e}",
                self.path.display()
            ),
        }
    }

    fn audit_tool_call(&self, name: &str, input: &Value) {
        let accesses = extract_path_values(input)
            .into_iter()
            .map(|raw| self.classify_access(&raw))
            .collect();
        self.write(AuditEvent::ToolCall {
            name: name.to_string(),
            input: input.clone(),
            accesses,
        });
    }

    pub fn record_feed(&self, item: &FeedItem) {
        match item {
            FeedItem::ToolCall { name, input } => self.audit_tool_call(name, input),
            FeedItem::FileChanges(FileChanges { created, modified }) => {
                self.write(AuditEvent::FileChanges {
                    created: created.clone(),
                    modified: modified.clone(),
                });
            }
            _ => {}
        }
    }

    fn classify_access(&self, raw: &str) -> AuditAccess {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return AuditAccess {
                raw: raw.to_string(),
                resolved: None,
                verdict: AccessVerdict::Unknown,
                reason: "empty path".into(),
            };
        }
        let candidate = Path::new(trimmed);
        let resolved = if candidate.is_absolute() || trimmed.starts_with("~/") {
            crate::paths::expand_tilde(candidate)
        } else {
            self.working_dir.join(candidate)
        };
        match self.policy.ensure_path_allowed(&self.agent_root, &resolved) {
            Ok(()) => AuditAccess {
                raw: raw.to_string(),
                resolved: Some(resolved.to_string_lossy().to_string()),
                verdict: AccessVerdict::Allowed,
                reason: "inside agent policy".into(),
            },
            Err(e) => AuditAccess {
                raw: raw.to_string(),
                resolved: Some(resolved.to_string_lossy().to_string()),
                verdict: AccessVerdict::Denied,
                reason: e.to_string(),
            },
        }
    }
}

impl SessionObserver for AgentAudit {
    fn on_feed(&self, item: &FeedItem) {
        self.record_feed(item);
    }

    fn on_session_id(&self, session_id: &str) {
        self.write(AuditEvent::SessionId {
            provider_session_id: session_id.to_string(),
        });
    }

    fn on_status(&self, status: &str, error: Option<&str>) {
        self.write(AuditEvent::SessionStatus {
            status: status.to_string(),
            error: error.map(str::to_string),
        });
    }
}

pub fn read_session(agent_root: &Path, session_key: &str) -> CoreResult<Vec<Value>> {
    let path = audit_path(agent_root, session_key);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let body = std::fs::read_to_string(path)?;
    Ok(body
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .collect())
}

fn audit_path(agent_root: &Path, session_key: &str) -> PathBuf {
    agent_root
        .join(".houston")
        .join("audit")
        .join(format!("{}.jsonl", safe_session_key(session_key)))
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

fn extract_path_values(input: &Value) -> Vec<String> {
    let mut out = Vec::new();
    collect_path_values(input, None, &mut out);
    out.sort();
    out.dedup();
    out
}

fn collect_path_values(value: &Value, key: Option<&str>, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                collect_path_values(v, Some(k), out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_path_values(item, key, out);
            }
        }
        Value::String(s) if key.map(is_path_key).unwrap_or(false) => out.push(s.clone()),
        _ => {}
    }
}

fn is_path_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    matches!(
        key.as_str(),
        "path"
            | "file"
            | "filename"
            | "file_name"
            | "file_path"
            | "filepath"
            | "relative_path"
            | "rel_path"
            | "cwd"
            | "working_dir"
    ) || key.ends_with("_path")
}

fn tool_mode_name(mode: &ToolMode) -> &'static str {
    match mode {
        ToolMode::Restricted => "restricted",
        ToolMode::Full => "full",
        ToolMode::ConversationOnly => "conversation_only",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn extracts_nested_path_like_values() {
        let input = serde_json::json!({
            "file_path": "reports/a.txt",
            "options": { "cwd": "reports" },
            "ignored": "not-a-path"
        });
        let paths = extract_path_values(&input);
        assert_eq!(paths, vec!["reports", "reports/a.txt"]);
    }

    #[test]
    fn classifies_denied_sibling_path() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("finance");
        let working = agent.clone();
        std::fs::create_dir_all(&agent).unwrap();
        std::fs::create_dir_all(d.path().join("sales")).unwrap();
        let audit = AgentAudit {
            agent_root: agent.clone(),
            working_dir: working,
            path: agent.join(".houston/audit/s.jsonl"),
            policy: AgentPolicy::default(),
        };
        let access = audit.classify_access("../sales/secret.txt");
        assert_eq!(access.verdict, AccessVerdict::Denied);
    }
}
