//! Workflow DTOs — wire shapes for `.houston/workflows/*` and plan JSON.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// -- Plan (AI planner output) --

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkflowPlan {
    pub steps: Vec<WorkflowStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub task: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default)]
    pub use_worktree: bool,
    #[serde(default)]
    pub depends_on: Vec<String>,
    /// When true, the run pauses at this step until the user approves before dispatch.
    #[serde(default)]
    pub requires_approval: bool,
}

// -- Workflow definition --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Instruction an AI planner uses to generate a [`WorkflowPlan`].
    pub plan_prompt: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewWorkflow {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub plan_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub plan_prompt: Option<String>,
}

// -- Workflow run --

/// A workflow run that has been created but not yet planned or executed.
pub struct BegunRun {
    pub working_dir: PathBuf,
    pub workflow: Workflow,
    pub run: WorkflowRun,
}

/// Spec for an inline run whose workflow definition is stored on the run itself.
#[derive(Debug, Clone)]
pub struct InlineRunSpec {
    pub plan_prompt: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Per-step execution snapshot on a run. Phase 2's executor updates these.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StepState {
    pub step_id: String,
    /// `"pending" | "awaiting_approval" | "running" | "done" | "error" | "cancelled"`.
    pub status: String,
    /// User approved a mid-run gate for this step.
    #[serde(default)]
    pub approved: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Set when `use_worktree` is true so cleanup can call `remove_worktree`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    /// `"planning" | "awaiting_approval" | "running" | "done" | "error" | "cancelled"`.
    pub status: String,
    /// Session key for chat history lookup (`"workflow-{wid}-run-{run_id}"`).
    pub session_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<WorkflowPlan>,
    #[serde(default)]
    pub steps: Vec<StepState>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub started_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    /// Inline workflow spec: planner instruction when no saved definition exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowRunUpdate {
    pub status: Option<String>,
    pub plan: Option<WorkflowPlan>,
    pub steps: Option<Vec<StepState>>,
    pub summary: Option<String>,
    pub completed_at: Option<String>,
}
