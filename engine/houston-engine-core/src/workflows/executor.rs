//! Dependency-aware fan-out over workflow plan steps.

use crate::error::{CoreError, CoreResult};
use crate::sessions::SessionRuntime;
use crate::workflows::connections::ConnectionChecker;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::Workflow;
use houston_ui_events::DynEventSink;
use std::path::Path;
use std::sync::Arc;

#[path = "executor_fanout.rs"]
mod executor_fanout;

use executor_fanout::{drive_fanout, FanoutCtx, FanoutState};

pub struct FanoutResult {
    pub all_ok: bool,
    /// Run paused at a user gate.
    pub paused: bool,
}

pub async fn run_fanout(
    events: &DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    _rt: &SessionRuntime,
    connection_checker: Arc<dyn ConnectionChecker>,
    agent_path: &str,
    root: &Path,
    workflow: &Workflow,
    run_id: &str,
    resume: bool,
) -> CoreResult<FanoutResult> {
    let plan = workflow_runs::find_by_id(root, run_id)?
        .plan
        .clone()
        .ok_or_else(|| CoreError::Internal(format!("workflow run {run_id} has no plan")))?;

    let ctx = FanoutCtx {
        events,
        dispatcher,
        connection_checker,
        agent_path,
        root,
        workflow,
        plan: &plan,
        run_id,
        resume,
    };
    let mut state = FanoutState::new();
    state.prime_redispatch_tick().await;

    drive_fanout(&ctx, &mut state).await
}
