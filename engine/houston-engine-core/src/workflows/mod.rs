//! Workflows — multi-step orchestrated agent tasks (Phase 1: data foundation).
//!
//! Phase 1 provides typed plan schemas and on-disk workflow + run records.
//! Execution (fan-out, approval gate, events) lands in later phases.

pub mod defs;
pub mod plan;
pub mod runs;
pub mod types;

use crate::error::CoreResult;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;

pub use defs::{create as create_workflow, delete as delete_workflow, find_by_id as find_workflow_by_id, list as list_workflows, update as update_workflow};
pub use plan::parse_plan;
pub use runs::{
    create as create_workflow_run, find_by_id as find_workflow_run_by_id,
    list as list_workflow_runs, list_for_workflow, step_states_from_plan,
    sweep_orphan_running, update as update_workflow_run,
};
pub use types::{
    NewWorkflow, StepState, Workflow, WorkflowPlan, WorkflowRun, WorkflowRunUpdate,
    WorkflowStep, WorkflowUpdate,
};

pub(crate) fn read_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
) -> CoreResult<T> {
    crate::agents::store::read_json(root, name)
}

pub(crate) fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    crate::agents::store::write_json(root, name, data)
}

pub(crate) fn ensure_houston_dir(root: &Path) -> CoreResult<()> {
    let dir = root.join(".houston");
    std::fs::create_dir_all(&dir)?;
    Ok(())
}
