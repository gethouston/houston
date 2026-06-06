//! Workflows — multi-step orchestrated agent tasks.

pub mod defs;
pub mod dispatcher;
pub mod engine_dispatcher;
pub mod executor;
pub mod executor_sched;
pub mod executor_step;
pub mod guards;
pub mod keys;
pub mod plan;
pub mod plan_extract;
pub mod planner;
pub mod runner;
pub mod runner_execute;
pub mod runs;
pub mod step_prompt;
pub mod step_verify;
pub mod synthesis;
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
pub use guards::{enforce_run_limits, MAX_RECURSION_DEPTH, MAX_STEPS_PER_RUN};
pub use runner::{
    approve_run, begin_run, cancel_run, finish_planning, resume_run, BegunRun,
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
