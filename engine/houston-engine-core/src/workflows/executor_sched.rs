//! Scheduling helpers for the workflow fan-out executor.

use crate::error::CoreResult;
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{WorkflowPlan, WorkflowStep};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::collections::HashSet;
use std::path::Path;

pub(crate) fn eligible_status(status: &str, resume: bool) -> bool {
    status == "pending" || (resume && (status == "error" || status == "cancelled"))
}

pub(crate) fn deps_done(step: &WorkflowStep, states: &[crate::workflows::types::StepState]) -> bool {
    step.depends_on.iter().all(|dep| {
        states
            .iter()
            .find(|s| s.step_id == *dep)
            .is_some_and(|s| s.status == "done")
    })
}

pub(crate) fn failed_dep(
    step: &WorkflowStep,
    states: &[crate::workflows::types::StepState],
) -> bool {
    step.depends_on.iter().any(|dep| {
        states
            .iter()
            .find(|s| s.step_id == *dep)
            .is_some_and(|s| s.status == "error" || s.status == "cancelled")
    })
}

pub(crate) fn mark_step_cancelled(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    step_id: &str,
    reason: &str,
) -> CoreResult<()> {
    workflow_runs::patch_step(root, run_id, step_id, |s| {
        s.status = "cancelled".into();
        s.summary = Some(reason.into());
    })?;
    emit_step(events, agent_path, run_id, step_id);
    emit_runs_changed(events, agent_path);
    Ok(())
}

pub(crate) fn cancel_dependents(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    plan: &WorkflowPlan,
    failed_id: &str,
    blocked: &mut HashSet<String>,
) -> CoreResult<()> {
    let mut queue = vec![failed_id.to_string()];
    while let Some(id) = queue.pop() {
        for step in &plan.steps {
            if !step.depends_on.iter().any(|d| d == &id) {
                continue;
            }
            if !blocked.insert(step.id.clone()) {
                continue;
            }
            mark_step_cancelled(
                events,
                agent_path,
                root,
                run_id,
                &step.id,
                "blocked by failed dependency",
            )?;
            queue.push(step.id.clone());
        }
    }
    Ok(())
}

pub(crate) fn is_run_cancelled(root: &Path, run_id: &str) -> CoreResult<bool> {
    Ok(workflow_runs::find_by_id(root, run_id)?.status == "cancelled")
}

pub(crate) fn emit_step(events: &DynEventSink, agent_path: &str, run_id: &str, step_id: &str) {
    events.emit(HoustonEvent::WorkflowStepChanged {
        agent_path: agent_path.to_string(),
        run_id: run_id.to_string(),
        step_id: step_id.to_string(),
    });
}
