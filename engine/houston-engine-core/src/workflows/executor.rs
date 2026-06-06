//! Dependency-aware fan-out over workflow plan steps.

use crate::error::{CoreError, CoreResult};
use crate::sessions::SessionRuntime;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::executor_sched::{
    cancel_dependents, deps_done, eligible_status, failed_dep, is_gated, is_run_cancelled,
    mark_step_awaiting, mark_step_cancelled,
};
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::WorkflowRunUpdate;
use crate::workflows::executor_step::{finish_step, spawn_step};
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::types::Workflow;
use houston_ui_events::DynEventSink;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::task::JoinSet;

pub struct FanoutResult {
    pub all_ok: bool,
    /// Run paused at a mid-run approval gate; status is `awaiting_approval`.
    pub paused: bool,
}

pub async fn run_fanout(
    events: &DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    _rt: &SessionRuntime,
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

    let mut join_set = JoinSet::new();
    let mut in_flight: HashSet<String> = HashSet::new();
    let mut blocked: HashSet<String> = HashSet::new();

    loop {
        if is_run_cancelled(root, run_id)? {
            return Ok(FanoutResult {
                all_ok: false,
                paused: false,
            });
        }

        let run = workflow_runs::find_by_id(root, run_id)?;
        for step in &plan.steps {
            if in_flight.contains(&step.id) || blocked.contains(&step.id) {
                continue;
            }
            let state = run.steps.iter().find(|s| s.step_id == step.id);
            let status = state.map(|s| s.status.as_str()).unwrap_or("pending");
            if !eligible_status(status, resume) {
                continue;
            }
            if !deps_done(step, &run.steps) {
                continue;
            }
            if failed_dep(step, &run.steps) {
                mark_step_cancelled(
                    events,
                    agent_path,
                    root,
                    run_id,
                    &step.id,
                    "blocked by failed dependency",
                )?;
                blocked.insert(step.id.clone());
                continue;
            }
            if is_gated(step, &run.steps) {
                if status != "awaiting_approval" {
                    mark_step_awaiting(events, agent_path, root, run_id, &step.id)?;
                }
                continue;
            }

            in_flight.insert(step.id.clone());
            workflow_runs::patch_step(root, run_id, &step.id, |s| {
                s.status = "running".into();
            })?;
            crate::workflows::executor_sched::emit_step(events, agent_path, run_id, &step.id);
            emit_runs_changed(events, agent_path);
            spawn_step(
                &mut join_set,
                dispatcher.clone(),
                agent_path.to_string(),
                root.to_path_buf(),
                workflow.clone(),
                run_id.to_string(),
                step.clone(),
            );
        }

        if join_set.is_empty() {
            let run = workflow_runs::find_by_id(root, run_id)?;
            if run
                .steps
                .iter()
                .any(|s| s.status == "awaiting_approval")
            {
                workflow_runs::update(
                    root,
                    run_id,
                    WorkflowRunUpdate {
                        status: Some("awaiting_approval".into()),
                        ..Default::default()
                    },
                )?;
                emit_runs_changed(events, agent_path);
                return Ok(FanoutResult {
                    all_ok: false,
                    paused: true,
                });
            }
            break;
        }

        let Some(joined) = join_set.join_next().await else {
            break;
        };
        let result = joined.map_err(|e| CoreError::Internal(format!("step task failed: {e}")))?;
        in_flight.remove(&result.step_id);
        let failed_step = result.step_id.clone();
        let ok = finish_step(events, agent_path, root, run_id, result).await?;
        if !ok {
            cancel_dependents(
                events,
                agent_path,
                root,
                run_id,
                &plan,
                &failed_step,
                &mut blocked,
            )?;
        }
    }

    let run = workflow_runs::find_by_id(root, run_id)?;
    Ok(FanoutResult {
        all_ok: run.steps.iter().all(|s| s.status == "done"),
        paused: false,
    })
}
