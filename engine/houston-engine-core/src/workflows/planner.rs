//! Planner turn — one AI session that emits a validated [`WorkflowPlan`].

use crate::error::CoreResult;
use crate::workflows::dispatcher::{PlannerContext, WorkflowDispatcher};
use crate::workflows::plan::parse_plan_from_response;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{Workflow, WorkflowRun, WorkflowRunUpdate};
use chrono::Utc;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::Path;
use std::sync::Arc;

pub const PLAN_JSON_INSTRUCTION: &str = "\n\n---\n\
Respond with ONLY a JSON object (no markdown, no commentary) matching this schema:\n\
{\"steps\":[{\"id\":\"unique-id\",\"task\":\"what to do\",\"depends_on\":[],\"use_worktree\":false}]}\n\
Each step needs a unique `id`, non-empty `task`, optional `depends_on` (step ids), \
optional `provider`/`model`/`effort`, and `use_worktree` (boolean, default false). \
Do not include steps that spawn nested workflows.";

pub fn build_planner_prompt(workflow: &Workflow) -> String {
    format!("{}{PLAN_JSON_INSTRUCTION}", workflow.plan_prompt)
}

/// Run the planner turn and persist the plan or drive the run to `error`.
pub async fn run_planner(
    events: &DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    root: &Path,
    workflow: &Workflow,
    run: &WorkflowRun,
) -> CoreResult<()> {
    let prompt = build_planner_prompt(workflow);
    let outcome = dispatcher
        .dispatch_planner(PlannerContext {
            agent_path,
            working_dir: root,
            workflow,
            run,
            prompt: &prompt,
        })
        .await;

    let now = Utc::now().to_rfc3339();
    if let Some(err) = outcome.error {
        workflow_runs::update(
            root,
            &run.id,
            WorkflowRunUpdate {
                status: Some("error".into()),
                summary: Some(err),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
        emit_runs_changed(events, agent_path);
        return Ok(());
    }

    match parse_plan_from_response(&outcome.response_text) {
        Ok(plan) => {
            workflow_runs::update(
                root,
                &run.id,
                WorkflowRunUpdate {
                    status: Some("awaiting_approval".into()),
                    plan: Some(plan),
                    ..Default::default()
                },
            )?;
            events.emit(HoustonEvent::WorkflowPlanProposed {
                agent_path: agent_path.to_string(),
                run_id: run.id.clone(),
            });
            emit_runs_changed(events, agent_path);
        }
        Err(e) => {
            workflow_runs::update(
                root,
                &run.id,
                WorkflowRunUpdate {
                    status: Some("error".into()),
                    summary: Some(e.to_string()),
                    completed_at: Some(now),
                    ..Default::default()
                },
            )?;
            emit_runs_changed(events, agent_path);
        }
    }
    Ok(())
}

pub(crate) fn emit_runs_changed(events: &DynEventSink, agent_path: &str) {
    events.emit(HoustonEvent::WorkflowRunsChanged {
        agent_path: agent_path.to_string(),
    });
}
