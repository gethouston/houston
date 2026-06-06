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

/// Appended to the system prompt on planner-only turns (not shown to the user).
pub const PLANNER_SYSTEM_APPENDIX: &str = "\n\n---\n\
# Workflow planning turn (internal)\n\
This is workflow planning, not a user chat turn. Do not use tools. Do not ask questions. \
Do not execute the work yet. Respond with ONLY one JSON object matching the schema in \
the user message. No markdown fences, no commentary, no preamble. Houston parses this \
JSON internally; it is never shown verbatim to the user.";

pub const PLAN_JSON_INSTRUCTION: &str = "\n\n---\n\
Respond with ONLY a JSON object (no markdown, no commentary) matching this schema:\n\
{\"steps\":[{\"id\":\"unique-id\",\"task\":\"what to do\",\"depends_on\":[],\"use_worktree\":false,\"requires_approval\":false}]}\n\
Each step needs a unique `id`, non-empty `task`, optional `depends_on` (step ids), \
optional `provider`/`model`/`effort`, `use_worktree` (boolean, default false), \
and `requires_approval` (boolean, default false). \
Set `requires_approval` to true on any step that creates, edits, sends, or deletes data \
in a connected app (email, calendar, Drive, Slack, etc.) or writes/deletes files on disk. \
Do not add standalone steps whose only job is to ask for approval; the engine pauses automatically. \
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
