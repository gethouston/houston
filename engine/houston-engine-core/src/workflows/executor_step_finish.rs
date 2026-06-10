//! Step completion: worktree cleanup, connection gates, and status persistence.

use crate::error::CoreResult;
use crate::workflows::connection_blocker::parse_connection_blocker;
use crate::workflows::connection_probe::{maybe_recover_connection, AfterProbe};
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::executor_sched::emit_step;
use crate::workflows::executor_step::{StepFinish, StepTaskResult};
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::step_verify::step_reapproval_only;
use crate::workflows::types::{StepState, Workflow, WorkflowConnectionBlocker};
use crate::worktree::{self, RemoveWorktreeRequest};
use houston_ui_events::DynEventSink;
use std::path::Path;
use std::sync::Arc;

fn persist_step(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    step_id: &str,
    patch: impl FnMut(&mut StepState),
) -> CoreResult<()> {
    workflow_runs::patch_step(root, run_id, step_id, patch)?;
    emit_step(events, agent_path, run_id, step_id);
    emit_runs_changed(events, agent_path);
    Ok(())
}

fn persist_waiting(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    step_id: &str,
    blocker: WorkflowConnectionBlocker,
) -> CoreResult<()> {
    persist_step(events, agent_path, root, run_id, step_id, |s| {
        s.status = "waiting_for_connection".into();
        s.summary = None;
        s.worktree_path = None;
        s.blocker = Some(blocker.clone());
    })
}

pub(crate) async fn finish_step(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    workflow: &Workflow,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    result: StepTaskResult,
) -> CoreResult<StepFinish> {
    if let Some(wt) = result.worktree_path.as_deref() {
        if let Err(e) = worktree::remove_worktree(RemoveWorktreeRequest {
            repo_path: root.to_string_lossy().to_string(),
            worktree_path: wt.to_string(),
        })
        .await
        {
            persist_step(events, agent_path, root, run_id, &result.step_id, |s| {
                s.status = "error".into();
                s.summary = Some(format!("worktree cleanup failed: {e}"));
                s.worktree_path = None;
                s.blocker = None;
            })?;
            return Ok(StepFinish::Failed);
        }
    }

    if let Some(err) = result.outcome.error {
        persist_step(events, agent_path, root, run_id, &result.step_id, |s| {
            s.status = "error".into();
            s.summary = Some(err.clone());
            s.worktree_path = None;
            s.blocker = None;
        })?;
        return Ok(StepFinish::Failed);
    }

    let summary = result.outcome.response_text;
    if let Some(blocker) = parse_connection_blocker(&summary) {
        persist_waiting(
            events,
            agent_path,
            root,
            run_id,
            &result.step_id,
            blocker,
        )?;
        return Ok(StepFinish::WaitingForConnection);
    }

    if let Some(after_probe) = maybe_recover_connection(
        dispatcher,
        agent_path,
        root,
        workflow,
        run_id,
        &result.step_id,
        &summary,
    )
    .await?
    {
        match after_probe {
            AfterProbe::WaitingForConnection(blocker) => {
                persist_waiting(
                    events,
                    agent_path,
                    root,
                    run_id,
                    &result.step_id,
                    blocker,
                )?;
                return Ok(StepFinish::WaitingForConnection);
            }
            AfterProbe::Failed => {
                persist_step(events, agent_path, root, run_id, &result.step_id, |s| {
                    s.status = "error".into();
                    s.summary = Some(summary.clone());
                    s.worktree_path = None;
                    s.blocker = None;
                })?;
                return Ok(StepFinish::Failed);
            }
            AfterProbe::Continue => {}
        }
    }

    let run = workflow_runs::find_by_id(root, run_id)?;
    let requires_approval = run
        .plan
        .as_ref()
        .and_then(|p| p.steps.iter().find(|s| s.id == result.step_id))
        .is_some_and(|s| s.requires_approval);
    if requires_approval && step_reapproval_only(&summary) {
        let err = "Step completed without performing the approved action. \
The agent re-asked for approval instead of using connected-app tools."
            .to_string();
        persist_step(events, agent_path, root, run_id, &result.step_id, |s| {
            s.status = "error".into();
            s.summary = Some(err.clone());
            s.worktree_path = None;
            s.blocker = None;
        })?;
        return Ok(StepFinish::Failed);
    }
    persist_step(events, agent_path, root, run_id, &result.step_id, |s| {
        s.status = "done".into();
        s.summary = Some(summary.clone());
        s.worktree_path = None;
        s.blocker = None;
    })?;
    Ok(StepFinish::Done)
}
