//! Stable session-key helpers for workflow runs and per-step subagents.

pub fn step_session_key(workflow_id: &str, run_id: &str, step_id: &str) -> String {
    format!("workflow-{workflow_id}-run-{run_id}-step-{step_id}")
}
