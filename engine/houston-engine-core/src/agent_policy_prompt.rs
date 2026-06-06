//! Prompt rendering for per-agent access policy.

use crate::agent_policy::AgentPolicy;
use crate::agent_policy::ToolMode;
use std::path::Path;

pub fn policy_prompt_section(agent_root: &Path, policy: &AgentPolicy) -> String {
    let allowed = policy
        .resolved_allowed_roots(agent_root)
        .unwrap_or_default()
        .into_iter()
        .map(|p| format!("- `{}`", p.display()))
        .collect::<Vec<_>>()
        .join("\n");
    let denied = policy
        .denied_roots
        .iter()
        .map(|p| format!("- `{p}`"))
        .collect::<Vec<_>>()
        .join("\n");
    let denied = if denied.is_empty() {
        "- none".to_string()
    } else {
        denied
    };
    let gateway = if matches!(policy.tool_mode, ToolMode::Restricted) {
        "\n\nRestricted file access: use the Houston controlled file tools (`houston_files`) for listing, reading, searching, and writing project files. Do not use native filesystem or shell tools to inspect files."
    } else {
        ""
    };
    format!(
        "# Agent Access Policy\n\n\
         Tool mode: `{:?}`\n\n\
         Allowed filesystem roots:\n{}\n\n\
         Denied roots:\n{}\n\n\
         Do not ask for, read, summarize, or modify data outside the allowed roots. \
         If a task needs data outside this policy, ask the user to change the agent's access policy.{}",
        policy.tool_mode, allowed, denied, gateway
    )
}
