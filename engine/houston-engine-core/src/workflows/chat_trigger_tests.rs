//! Tests for chat-triggered workflow runs.

use super::*;
use crate::workflows::defs::create as create_workflow;
use crate::workflows::dispatcher::{
    DispatchOutcome, PlannerContext, StepContext, SynthesisContext, WorkflowDispatcher,
};
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::NewWorkflow;
use async_trait::async_trait;
use houston_db::Database;
use houston_terminal_manager::FeedItem;
use houston_ui_events::{EventSink, HoustonEvent};
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

struct Recorder {
    events: Mutex<Vec<HoustonEvent>>,
}

impl EventSink for Recorder {
    fn emit(&self, event: HoustonEvent) {
        self.events.lock().unwrap().push(event);
    }
}

struct ScriptedDispatcher {
    planner: DispatchOutcome,
}

#[async_trait]
impl WorkflowDispatcher for ScriptedDispatcher {
    async fn dispatch_planner(&self, _ctx: PlannerContext<'_>) -> DispatchOutcome {
        self.planner.clone()
    }

    async fn dispatch_step(&self, ctx: StepContext<'_>) -> DispatchOutcome {
        DispatchOutcome {
            response_text: format!("done {}", ctx.step.id),
            error: None,
        }
    }

    async fn dispatch_synthesis(&self, _ctx: SynthesisContext<'_>) -> DispatchOutcome {
        DispatchOutcome {
            response_text: "summary".into(),
            error: None,
        }
    }
}

fn marker_json(extra: &str) -> String {
    format!("<!--houston:workflow {{{extra}}}-->")
}

fn sample_workflow() -> NewWorkflow {
    NewWorkflow {
        name: "Audit".into(),
        description: String::new(),
        plan_prompt: "Plan a scan".into(),
    }
}

fn feed_system_messages(events: &[HoustonEvent]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            HoustonEvent::FeedItem { item, .. } => match item {
                FeedItem::SystemMessage(m) => Some(m.clone()),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

#[test]
fn parse_valid_marker() {
    let raw = marker_json(r#""planPrompt":"scan repo""#);
    let t = parse_trigger(&raw).expect("parsed");
    assert_eq!(t.plan_prompt.as_deref(), Some("scan repo"));
}

#[test]
fn parse_marker_with_surrounding_prose() {
    let raw = format!(
        "I'll set this up.\n{}\nLet me know when you're ready.",
        marker_json(r#""planPrompt":"x""#)
    );
    assert!(parse_trigger(&raw).is_some());
}

#[test]
fn parse_missing_marker_returns_none() {
    assert!(parse_trigger("plain reply").is_none());
}

#[test]
fn parse_malformed_json_returns_none() {
    assert!(parse_trigger("<!--houston:workflow {not json}-->").is_none());
}

#[test]
fn parse_only_first_marker() {
    let raw = format!(
        "{}\n{}",
        marker_json(r#""planPrompt":"first""#),
        marker_json(r#""planPrompt":"second""#)
    );
    let t = parse_trigger(&raw).unwrap();
    assert_eq!(t.plan_prompt.as_deref(), Some("first"));
}

#[test]
fn route_saved_when_id_exists() {
    let d = TempDir::new().unwrap();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let route = route_trigger(
        d.path(),
        &WorkflowTrigger {
            workflow_id: Some(w.id.clone()),
            name: None,
            description: None,
            plan_prompt: Some("ignored".into()),
        },
    )
    .unwrap();
    assert!(matches!(route, TriggerRoute::Saved(id) if id == w.id));
}

#[test]
fn route_inline_when_id_unknown() {
    let d = TempDir::new().unwrap();
    let route = route_trigger(
        d.path(),
        &WorkflowTrigger {
            workflow_id: Some("missing".into()),
            name: Some("Task".into()),
            description: None,
            plan_prompt: Some("do work".into()),
        },
    )
    .unwrap();
    match route {
        TriggerRoute::Inline(spec) => {
            assert_eq!(spec.plan_prompt, "do work");
            assert_eq!(spec.name.as_deref(), Some("Task"));
        }
        TriggerRoute::Saved(_) => panic!("expected inline"),
    }
}

#[test]
fn route_inline_without_id() {
    let d = TempDir::new().unwrap();
    let route = route_trigger(
        d.path(),
        &WorkflowTrigger {
            workflow_id: None,
            name: None,
            description: None,
            plan_prompt: Some("inline task".into()),
        },
    )
    .unwrap();
    assert!(matches!(route, TriggerRoute::Inline(_)));
}

#[test]
fn route_errors_without_plan_prompt() {
    let d = TempDir::new().unwrap();
    assert!(matches!(
        route_trigger(
            d.path(),
            &WorkflowTrigger {
                workflow_id: None,
                name: None,
                description: None,
                plan_prompt: None,
            },
        )
        .unwrap_err(),
        CoreError::BadRequest(_)
    ));
}

#[test]
fn build_run_link_marker_shape() {
    let m = build_run_link_marker("run-abc");
    assert!(m.contains("houston:workflow-run"));
    assert!(m.contains(r#""runId":"run-abc""#));
}

#[tokio::test]
async fn handler_inline_marker_starts_run_and_emits_link() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let db = Database::connect_in_memory().await.unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let events: DynEventSink = recorder.clone();
    let planner_json = r#"{"steps":[{"id":"a","task":"first"}]}"#;
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: planner_json.into(),
            error: None,
        },
    });
    let response = format!(
        "Starting now.\n{}\n",
        marker_json(r#""planPrompt":"scan repo","name":"Scan""#)
    );

    maybe_trigger_from_chat(
        &events,
        &db,
        dispatcher,
        &agent_path,
        "chat-1",
        "desktop",
        Some(&response),
        Some("sid-1"),
    )
    .await
    .unwrap();

    let runs = workflow_runs::list(d.path()).unwrap();
    assert_eq!(runs.len(), 1);
    assert!(runs[0].workflow_id.starts_with("inline-"));

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &runs[0].id).unwrap();
        if run.status == "awaiting_approval" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not reach awaiting_approval: {}", run.status);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let msgs = feed_system_messages(&recorder.events.lock().unwrap());
    assert!(
        msgs.iter()
            .any(|m| m.contains("houston:workflow-run") && m.contains(&runs[0].id)),
        "expected run link marker, got: {msgs:?}"
    );
}

#[tokio::test]
async fn handler_saved_marker_uses_workflow_id() {
    let d = TempDir::new().unwrap();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let db = Database::connect_in_memory().await.unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let events: DynEventSink = recorder.clone();
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: r#"{"steps":[{"id":"a","task":"x"}]}"#.into(),
            error: None,
        },
    });
    let response = marker_json(&format!(
        r#""workflowId":"{}","planPrompt":"fallback""#,
        w.id
    ));

    maybe_trigger_from_chat(
        &events,
        &db,
        dispatcher,
        &agent_path,
        "chat-2",
        "desktop",
        Some(&response),
        None,
    )
    .await
    .unwrap();

    let runs = workflow_runs::list(d.path()).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].workflow_id, w.id);
    assert!(!runs[0].workflow_id.starts_with("inline-"));
}

#[tokio::test]
async fn handler_no_marker_is_noop() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let db = Database::connect_in_memory().await.unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let events: DynEventSink = recorder.clone();
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome::default(),
    });

    maybe_trigger_from_chat(
        &events,
        &db,
        dispatcher,
        &agent_path,
        "chat-3",
        "desktop",
        Some("just an answer"),
        None,
    )
    .await
    .unwrap();

    assert!(workflow_runs::list(d.path()).unwrap().is_empty());
    assert!(feed_system_messages(&recorder.events.lock().unwrap()).is_empty());
}
