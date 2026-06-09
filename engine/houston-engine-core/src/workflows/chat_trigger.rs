//! Chat-triggered workflow runs — parse agent markers and start runs from chat turns.

use crate::error::{CoreError, CoreResult};
use crate::routines::runner::expand_tilde;
use crate::workflows::defs as workflow_defs;
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::inline::begin_inline_run;
use crate::workflows::runner::{begin_run, start_planning};
use crate::workflows::types::InlineRunSpec;
use houston_db::Database;
use houston_terminal_manager::FeedItem;
use houston_ui_events::{DynEventSink, HoustonEvent};
use serde::Deserialize;
use std::path::Path;
use std::sync::Arc;

const TRIGGER_PREFIX: &str = "<!--houston:workflow ";
const RUN_LINK_PREFIX: &str = "<!--houston:workflow-run ";
const MARKER_SUFFIX: &str = "-->";

/// Payload inside `<!--houston:workflow {...}-->`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTrigger {
    #[serde(default)]
    pub workflow_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub plan_prompt: Option<String>,
}

#[derive(Debug)]
pub enum TriggerRoute {
    Saved(String),
    Inline(InlineRunSpec),
}

pub fn parse_trigger(text: &str) -> Option<WorkflowTrigger> {
    let json = extract_trigger_json(text)?;
    serde_json::from_str(json).ok()
}

fn extract_trigger_json(raw: &str) -> Option<&str> {
    let start = raw.find(TRIGGER_PREFIX)?;
    let after = start + TRIGGER_PREFIX.len();
    let rest = raw.get(after..)?;
    let end = rest.find(MARKER_SUFFIX)?;
    let json = rest.get(..end)?.trim();
    (!json.is_empty()).then_some(json)
}

pub fn route_trigger(root: &Path, trigger: &WorkflowTrigger) -> CoreResult<TriggerRoute> {
    if let Some(ref id) = trigger.workflow_id {
        if workflow_defs::find_by_id(root, id).is_ok() {
            return Ok(TriggerRoute::Saved(id.clone()));
        }
    }
    let plan_prompt = trigger.plan_prompt.as_deref().unwrap_or("").trim();
    if plan_prompt.is_empty() {
        return Err(CoreError::BadRequest(
            "workflow trigger requires planPrompt when no saved workflow matches".into(),
        ));
    }
    Ok(TriggerRoute::Inline(InlineRunSpec {
        plan_prompt: plan_prompt.to_string(),
        name: trigger.name.clone(),
        description: trigger.description.clone(),
    }))
}

pub fn build_run_link_marker(run_id: &str) -> String {
    let payload = serde_json::json!({ "runId": run_id });
    format!("{RUN_LINK_PREFIX}{payload}{MARKER_SUFFIX}")
}

/// After a user chat turn, start a workflow when the agent emitted a trigger marker.
pub async fn maybe_trigger_from_chat(
    events: &DynEventSink,
    db: &Database,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    session_key: &str,
    source: &str,
    response_text: Option<&str>,
    claude_session_id: Option<&str>,
) -> CoreResult<()> {
    let Some(text) = response_text else {
        return Ok(());
    };
    let Some(trigger) = parse_trigger(text) else {
        return Ok(());
    };

    let root = expand_tilde(Path::new(agent_path));
    let begun = match route_trigger(&root, &trigger) {
        Ok(TriggerRoute::Saved(id)) => begin_run(events, agent_path, &id),
        Ok(TriggerRoute::Inline(spec)) => begin_inline_run(events, agent_path, spec),
        Err(e) => {
            surface_trigger_error(events, agent_path, session_key, &e);
            return Err(e);
        }
    };
    let begun = match begun {
        Ok(b) => b,
        Err(e) => {
            surface_trigger_error(events, agent_path, session_key, &e);
            return Err(e);
        }
    };

    emit_and_persist_run_link(
        events,
        db,
        agent_path,
        session_key,
        source,
        &begun.run.id,
        claude_session_id,
    )
    .await?;

    let agent_path_owned = agent_path.to_string();
    let events_spawn = events.clone();
    tokio::spawn(async move {
        if let Err(e) = start_planning(events_spawn, dispatcher, &agent_path_owned, begun).await
        {
            tracing::error!("[workflows] chat trigger planning failed: {e}");
        }
    });
    Ok(())
}

async fn emit_and_persist_run_link(
    events: &DynEventSink,
    db: &Database,
    agent_path: &str,
    session_key: &str,
    source: &str,
    run_id: &str,
    claude_session_id: Option<&str>,
) -> CoreResult<()> {
    let marker = build_run_link_marker(run_id);
    events.emit(HoustonEvent::FeedItem {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        item: FeedItem::SystemMessage(marker.clone()),
    });
    if let Some(sid) = claude_session_id {
        let data = serde_json::Value::String(marker).to_string();
        db.add_chat_feed_item_by_session(sid, "system_message", &data, source)
            .await
            .map_err(|e| CoreError::Internal(e.to_string()))?;
    }
    Ok(())
}

fn surface_trigger_error(
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
    err: &CoreError,
) {
    tracing::error!("[workflows] chat workflow trigger failed: {err}");
    events.emit(HoustonEvent::FeedItem {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        item: FeedItem::SystemMessage(format!("Could not start workflow: {err}")),
    });
}

#[cfg(test)]
#[path = "chat_trigger_tests.rs"]
mod tests;
