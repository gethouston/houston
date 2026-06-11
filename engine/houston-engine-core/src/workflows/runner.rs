//! Workflow run lifecycle — plan, approve, execute, cancel, resume.

use crate::error::{CoreError, CoreResult};
use crate::routines::runner::expand_tilde;
use crate::sessions::{self, SessionRuntime};
use crate::workflows::defs as workflow_defs;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::executor_sched::retry_reset_ids;
use crate::workflows::inline;
use crate::workflows::keys::step_session_key;
use crate::workflows::planner::{self, emit_runs_changed};
use crate::workflows::runner_execute::execute_run;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{BegunRun, Workflow, WorkflowRun, WorkflowRunUpdate};
use crate::worktree::RemoveWorktreeRequest;
use chrono::Utc;
use houston_ui_events::DynEventSink;
use std::path::Path;
use std::sync::Arc;

pub fn begin_run(
    events: &DynEventSink,
    agent_path: &str,
    workflow_id: &str,
) -> CoreResult<BegunRun> {
    let working_dir = expand_tilde(Path::new(agent_path));
    let workflow = workflow_defs::find_by_id(&working_dir, workflow_id)?;
    let run = workflow_runs::create(&working_dir, workflow_id)?;
    emit_runs_changed(events, agent_path);
    Ok(BegunRun {
        working_dir,
        workflow,
        run,
    })
}

/// Reset an awaiting-approval run and return a [`BegunRun`] ready for replanning.
pub fn replan_run(
    root: &Path,
    run_id: &str,
    feedback: &str,
) -> CoreResult<BegunRun> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    if run.status != "awaiting_approval" {
        return Err(CoreError::Conflict(format!(
            "workflow run {run_id} cannot replan (status={})",
            run.status
        )));
    }
    let base_prompt = run
        .plan_prompt
        .clone()
        .or_else(|| inline::effective_workflow(root, &run).ok().map(|w| w.plan_prompt))
        .filter(|p| !p.trim().is_empty())
        .ok_or_else(|| {
            CoreError::BadRequest("workflow run has no plan prompt to replan from".into())
        })?;
    let augmented = format!("{base_prompt}\n\nUser requested plan changes:\n{feedback}");
    let run = workflow_runs::reset_for_replan(root, run_id, &augmented)?;
    let workflow = inline::effective_workflow(root, &run)?;
    Ok(BegunRun {
        working_dir: root.to_path_buf(),
        workflow,
        run,
    })
}

pub async fn finish_planning(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    begun: BegunRun,
) -> CoreResult<()> {
    planner::run_planner(
        &events,
        dispatcher,
        agent_path,
        &begun.working_dir,
        &begun.workflow,
        &begun.run,
    )
    .await
}

/// Start planning for a begun run: reuse a frozen def plan or invoke the AI planner.
pub async fn start_planning(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    begun: BegunRun,
) -> CoreResult<()> {
    if let Some(plan) = &begun.workflow.plan {
        planner::attach_frozen_plan(&events, agent_path, &begun.working_dir, &begun.run.id, plan)?;
        Ok(())
    } else {
        finish_planning(events, dispatcher, agent_path, begun).await
    }
}

fn patch_awaiting_steps(
    root: &Path,
    run_id: &str,
    awaiting_step_ids: &[String],
) -> CoreResult<()> {
    for step_id in awaiting_step_ids {
        workflow_runs::patch_step(root, run_id, step_id, |s| {
            s.approved = true;
            s.status = "pending".into();
        })?;
    }
    Ok(())
}

fn spawn_execute_run(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: String,
    root: std::path::PathBuf,
    workflow: Workflow,
    run_id: String,
    resume: bool,
    log_label: &'static str,
) {
    tokio::spawn(async move {
        if let Err(e) = execute_run(
            events,
            dispatcher,
            rt,
            &agent_path,
            &root,
            workflow,
            &run_id,
            resume,
        )
        .await
        {
            tracing::error!("[workflows] {log_label} failed for run {run_id}: {e}");
        }
    });
}

pub async fn approve_run(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: &str,
    root: &Path,
    run_id: &str,
) -> CoreResult<WorkflowRun> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    let awaiting_step_ids: Vec<String> = run
        .steps
        .iter()
        .filter(|s| s.status == "awaiting_approval")
        .map(|s| s.step_id.clone())
        .collect();
    let has_awaiting_steps = !awaiting_step_ids.is_empty();

    match run.status.as_str() {
        "awaiting_approval" if !has_awaiting_steps => {}
        "awaiting_approval" | "running" | "waiting_for_connection" if has_awaiting_steps => {}
        other => {
            return Err(CoreError::Conflict(format!(
                "workflow run {run_id} is not awaiting approval (status={other})"
            )));
        }
    }

    let executor_still_fanning = run.status == "running" && has_awaiting_steps;
    patch_awaiting_steps(root, run_id, &awaiting_step_ids)?;
    emit_runs_changed(&events, agent_path);

    if executor_still_fanning {
        return workflow_runs::find_by_id(root, run_id);
    }

    let resume = run.steps.iter().any(|s| {
        matches!(
            s.status.as_str(),
            "done" | "error" | "cancelled" | "running"
        )
    });
    let workflow = inline::effective_workflow(root, &run)?;
    let updated = workflow_runs::update(
        root,
        run_id,
        WorkflowRunUpdate {
            status: Some("running".into()),
            ..Default::default()
        },
    )?;
    emit_runs_changed(&events, agent_path);

    spawn_execute_run(
        events,
        dispatcher,
        rt,
        agent_path.to_string(),
        root.to_path_buf(),
        workflow,
        run_id.to_string(),
        resume,
        "execute",
    );
    Ok(updated)
}

pub async fn retry_step(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    step_id: &str,
) -> CoreResult<WorkflowRun> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    if !matches!(
        run.status.as_str(),
        "error" | "cancelled" | "waiting_for_connection"
    ) {
        return Err(CoreError::Conflict(format!(
            "workflow run {run_id} cannot retry a step (status={})",
            run.status
        )));
    }
    let plan = run
        .plan
        .as_ref()
        .ok_or_else(|| CoreError::Internal(format!("workflow run {run_id} has no plan")))?;
    if !plan.steps.iter().any(|s| s.id == step_id) {
        return Err(CoreError::NotFound(format!("workflow step {step_id}")));
    }
    let step_state = run
        .steps
        .iter()
        .find(|s| s.step_id == step_id)
        .ok_or_else(|| CoreError::NotFound(format!("workflow step {step_id}")))?;
    if !matches!(
        step_state.status.as_str(),
        "error" | "cancelled" | "waiting_for_connection"
    ) {
        return Err(CoreError::Conflict(format!(
            "workflow step {step_id} is not retryable (status={})",
            step_state.status
        )));
    }

    let reset_ids = retry_reset_ids(plan, &run.steps, step_id);
    for id in &reset_ids {
        workflow_runs::patch_step(root, run_id, id, |s| {
            s.status = "pending".into();
            s.summary = None;
            s.worktree_path = None;
            s.blocker = None;
        })?;
    }
    let updated = workflow_runs::reopen_run(root, run_id)?;
    emit_runs_changed(&events, agent_path);

    let workflow = inline::effective_workflow(root, &updated)?;
    let agent_path = agent_path.to_string();
    let root = root.to_path_buf();
    let run_id_owned = run_id.to_string();
    let events_spawn = events.clone();
    tokio::spawn(async move {
        if let Err(e) = execute_run(
            events_spawn,
            dispatcher,
            rt,
            &agent_path,
            &root,
            workflow,
            &run_id_owned,
            false,
        )
        .await
        {
            tracing::error!("[workflows] retry execute failed for run {run_id_owned}: {e}");
        }
    });
    Ok(updated)
}

pub async fn resume_run(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: &str,
    root: &Path,
    run_id: &str,
) -> CoreResult<()> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    if !matches!(run.status.as_str(), "error" | "cancelled") {
        return Err(CoreError::Conflict(format!(
            "workflow run {run_id} cannot resume (status={})",
            run.status
        )));
    }
    let workflow = inline::effective_workflow(root, &run)?;
    workflow_runs::reopen_run(root, run_id)?;
    emit_runs_changed(&events, agent_path);
    execute_run(
        events, dispatcher, rt, agent_path, root, workflow, run_id, true,
    )
    .await
}

pub async fn cancel_run(
    rt: &SessionRuntime,
    events: &DynEventSink,
    root: &Path,
    agent_path: &str,
    run_id: &str,
) -> CoreResult<WorkflowRun> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    if !matches!(
        run.status.as_str(),
        "planning" | "awaiting_approval" | "waiting_for_connection" | "running"
    ) {
        return Err(CoreError::Conflict(format!(
            "workflow run {run_id} is not cancellable (status={})",
            run.status
        )));
    }

    let now = Utc::now().to_rfc3339();
    let updated = workflow_runs::update(
        root,
        run_id,
        WorkflowRunUpdate {
            status: Some("cancelled".into()),
            completed_at: Some(now.clone()),
            summary: Some("Stopped by user".into()),
            ..Default::default()
        },
    )?;

    sessions::cancel(rt, events, agent_path, &run.session_key).await;
    for step in &run.steps {
        if step.status == "running" {
            let key = step_session_key(&run.workflow_id, run_id, &step.step_id);
            sessions::cancel(rt, events, agent_path, &key).await;
        }
        if matches!(
            step.status.as_str(),
            "pending" | "awaiting_approval" | "waiting_for_connection"
        ) {
            let step_id = step.step_id.clone();
            if let Err(e) = workflow_runs::patch_step(root, run_id, &step_id, |s| {
                s.status = "cancelled".into();
                if s.summary.is_none() {
                    s.summary = Some("Stopped by user".into());
                }
                s.blocker = None;
            }) {
                tracing::error!(
                    "[workflows] failed to cancel pending step {step_id} on run {run_id}: {e}"
                );
            }
        }
        if let Some(wt) = &step.worktree_path {
            if let Err(e) = crate::worktree::remove_worktree(RemoveWorktreeRequest {
                repo_path: root.to_string_lossy().to_string(),
                worktree_path: wt.clone(),
            })
            .await
            {
                tracing::error!(
                    "[workflows] worktree cleanup on cancel for run {run_id} step {}: {e}",
                    step.step_id
                );
            }
        }
    }

    emit_runs_changed(events, agent_path);
    Ok(updated)
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod runner_tests;
