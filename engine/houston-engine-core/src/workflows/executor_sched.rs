//! Scheduling helpers for the workflow fan-out executor.

use crate::error::CoreResult;
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{StepState, WorkflowPlan, WorkflowStep};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::collections::HashSet;
use std::path::Path;

pub(crate) fn eligible_status(status: &str, resume: bool) -> bool {
    status == "pending" || (resume && (status == "error" || status == "cancelled"))
}

pub(crate) fn is_gated(step: &WorkflowStep, states: &[StepState]) -> bool {
    if !step.requires_approval {
        return false;
    }
    states
        .iter()
        .find(|s| s.step_id == step.id)
        .is_none_or(|s| !s.approved)
}

pub(crate) fn mark_step_awaiting(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    step_id: &str,
) -> CoreResult<()> {
    workflow_runs::patch_step(root, run_id, step_id, |s| {
        s.status = "awaiting_approval".into();
    })?;
    emit_step(events, agent_path, run_id, step_id);
    emit_runs_changed(events, agent_path);
    Ok(())
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

/// Step ids to reset when retrying one failed/blocked step: the target, every
/// non-`done` ancestor it depends on, and every transitive dependent.
pub(crate) fn retry_reset_ids(
    plan: &WorkflowPlan,
    states: &[StepState],
    step_id: &str,
) -> Vec<String> {
    let by_id: std::collections::HashMap<&str, &WorkflowStep> =
        plan.steps.iter().map(|s| (s.id.as_str(), s)).collect();
    let status_of = |id: &str| {
        states
            .iter()
            .find(|s| s.step_id == id)
            .map(|s| s.status.as_str())
            .unwrap_or("pending")
    };

    let mut reset = std::collections::HashSet::new();
    reset.insert(step_id.to_string());

    let mut queue = vec![step_id.to_string()];
    while let Some(id) = queue.pop() {
        if let Some(step) = by_id.get(id.as_str()) {
            for dep in &step.depends_on {
                if status_of(dep) != "done" && reset.insert(dep.clone()) {
                    queue.push(dep.clone());
                }
            }
        }
    }

    queue = vec![step_id.to_string()];
    while let Some(id) = queue.pop() {
        for step in &plan.steps {
            if step.depends_on.iter().any(|d| d == &id) && reset.insert(step.id.clone()) {
                queue.push(step.id.clone());
            }
        }
    }

    reset.into_iter().collect()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::plan::parse_plan;
    use crate::workflows::types::StepState;

    fn state(id: &str, status: &str) -> StepState {
        StepState {
            step_id: id.into(),
            status: status.into(),
            approved: false,
            summary: None,
            worktree_path: None,
        }
    }

    #[test]
    fn retry_reset_ids_includes_target_failed_ancestor_and_dependents() {
        // Diamond: a -> b, a -> c, b+c -> d. Retry c (error); a done, b unrelated error.
        let plan = parse_plan(
            r#"{"steps":[
              {"id":"a","task":"root"},
              {"id":"b","task":"left","depends_on":["a"]},
              {"id":"c","task":"right","depends_on":["a"]},
              {"id":"d","task":"merge","depends_on":["b","c"]}
            ]}"#,
        )
        .unwrap();
        let states = vec![
            state("a", "done"),
            state("b", "error"),
            state("c", "error"),
            state("d", "cancelled"),
        ];
        let mut ids = retry_reset_ids(&plan, &states, "c");
        ids.sort();
        assert_eq!(ids, vec!["c".to_string(), "d".to_string()]);
    }

    #[test]
    fn retry_reset_ids_includes_non_done_ancestors() {
        let plan = parse_plan(
            r#"{"steps":[
              {"id":"a","task":"first"},
              {"id":"b","task":"second","depends_on":["a"]}
            ]}"#,
        )
        .unwrap();
        let states = vec![state("a", "error"), state("b", "cancelled")];
        let mut ids = retry_reset_ids(&plan, &states, "b");
        ids.sort();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string()]);
    }
}
