//! Chat-driven workflow actions — approve or replan from assistant markers.

use crate::error::{CoreError, CoreResult};
use crate::routines::runner::expand_tilde;
use crate::sessions::SessionRuntime;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::runner::{approve_run, finish_planning, replan_run};
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::WorkflowRun;
use houston_ui_events::{DynEventSink, HoustonEvent};
use serde::Deserialize;
use std::path::Path;
use std::sync::Arc;

const APPROVE_PREFIX: &str = "<!--houston:workflow-approve ";
const REPLAN_PREFIX: &str = "<!--houston:workflow-replan ";
const MARKER_SUFFIX: &str = "-->";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowApproveAction {
    pub run_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReplanAction {
    pub run_id: String,
    pub feedback: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowChatAction {
    Approve(WorkflowApproveAction),
    Replan(WorkflowReplanAction),
}

pub fn parse_approve(text: &str) -> Option<WorkflowApproveAction> {
    let json = extract_marker_json(text, APPROVE_PREFIX)?;
    serde_json::from_str(json).ok()
}

pub fn parse_replan(text: &str) -> Option<WorkflowReplanAction> {
    let json = extract_marker_json(text, REPLAN_PREFIX)?;
    serde_json::from_str(json).ok()
}

pub fn parse_workflow_action(text: &str) -> Option<WorkflowChatAction> {
    if let Some(action) = parse_approve(text) {
        return Some(WorkflowChatAction::Approve(action));
    }
    if let Some(action) = parse_replan(text) {
        return Some(WorkflowChatAction::Replan(action));
    }
    None
}

fn extract_marker_json<'a>(raw: &'a str, prefix: &str) -> Option<&'a str> {
    let start = raw.find(prefix)?;
    let after = start + prefix.len();
    let rest = raw.get(after..)?;
    let end = rest.find(MARKER_SUFFIX)?;
    let json = rest.get(..end)?.trim();
    (!json.is_empty()).then_some(json)
}

fn verify_chat_link(
    root: &Path,
    run_id: &str,
    session_key: &str,
) -> CoreResult<WorkflowRun> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    match run.source_chat_session_key.as_deref() {
        Some(key) if key == session_key => Ok(run),
        Some(_) => Err(CoreError::BadRequest(
            "workflow run is linked to a different chat session".into(),
        )),
        None => Err(CoreError::BadRequest(
            "workflow run is not linked to this chat session".into(),
        )),
    }
}

/// After a user chat turn, approve or replan when the agent emitted an action marker.
pub async fn maybe_workflow_action_from_chat(
    events: &DynEventSink,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    rt: SessionRuntime,
    agent_path: &str,
    session_key: &str,
    response_text: Option<&str>,
) -> CoreResult<()> {
    let Some(text) = response_text else {
        return Ok(());
    };
    let Some(action) = parse_workflow_action(text) else {
        return Ok(());
    };

    let root = expand_tilde(Path::new(agent_path));
    match action {
        WorkflowChatAction::Approve(payload) => {
            verify_chat_link(&root, &payload.run_id, session_key)?;
            if let Err(e) = approve_run(
                events.clone(),
                dispatcher,
                rt,
                agent_path,
                &root,
                &payload.run_id,
            )
            .await
            {
                surface_action_error(events, agent_path, session_key, &e);
                return Err(e);
            }
        }
        WorkflowChatAction::Replan(payload) => {
            if payload.feedback.trim().is_empty() {
                let err = CoreError::BadRequest(
                    "workflow replan marker requires non-empty feedback".into(),
                );
                surface_action_error(events, agent_path, session_key, &err);
                return Err(err);
            }
            verify_chat_link(&root, &payload.run_id, session_key)?;
            let begun = replan_run(&root, &payload.run_id, &payload.feedback)?;
            let agent_path_owned = agent_path.to_string();
            let events_spawn = events.clone();
            tokio::spawn(async move {
                if let Err(e) = finish_planning(
                    events_spawn,
                    dispatcher,
                    &agent_path_owned,
                    begun,
                )
                .await
                {
                    tracing::error!("[workflows] chat replan failed: {e}");
                }
            });
        }
    }
    Ok(())
}

fn surface_action_error(
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
    err: &CoreError,
) {
    tracing::error!("[workflows] chat workflow action failed: {err}");
    events.emit(HoustonEvent::FeedItem {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        item: houston_terminal_manager::FeedItem::SystemMessage(format!(
            "Could not update workflow: {err}"
        )),
    });
}

#[cfg(test)]
#[path = "chat_actions_tests.rs"]
mod tests;
