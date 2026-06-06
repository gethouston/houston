//! Post-approval execution: fan-out + synthesis.

use crate::error::CoreResult;
use crate::sessions::SessionRuntime;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::executor;
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::synthesis;
use crate::workflows::types::{Workflow, WorkflowRunUpdate};
use chrono::Utc;
use houston_ui_events::DynEventSink;
use std::path::Path;
use std::sync::Arc;

pub(crate) async fn execute_run(
    events: DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: &str,
    root: &Path,
    workflow: Workflow,
    run_id: &str,
    resume: bool,
) -> CoreResult<()> {
    let fanout = executor::run_fanout(
        &events,
        dispatcher.clone(),
        &rt,
        agent_path,
        root,
        &workflow,
        run_id,
        resume,
    )
    .await?;

    if fanout.paused {
        return Ok(());
    }

    if terminal_cancelled(root, run_id)? {
        return Ok(());
    }

    let run = workflow_runs::find_by_id(root, run_id)?;
    let synthesis_out = synthesis::run_synthesis(
        dispatcher,
        agent_path,
        root,
        &workflow,
        &run,
    )
    .await;
    let now = Utc::now().to_rfc3339();

    if terminal_cancelled(root, run_id)? {
        return Ok(());
    }

    if let Some(err) = synthesis_out.error {
        workflow_runs::update(
            root,
            run_id,
            WorkflowRunUpdate {
                status: Some("error".into()),
                summary: Some(err),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
    } else if fanout.all_ok {
        workflow_runs::update(
            root,
            run_id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                summary: Some(synthesis_out.response_text),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
    } else {
        workflow_runs::update(
            root,
            run_id,
            WorkflowRunUpdate {
                status: Some("error".into()),
                summary: Some("one or more workflow steps failed".into()),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
    }
    emit_runs_changed(&events, agent_path);
    Ok(())
}

fn terminal_cancelled(root: &Path, run_id: &str) -> CoreResult<bool> {
    Ok(workflow_runs::find_by_id(root, run_id)?.status == "cancelled")
}
