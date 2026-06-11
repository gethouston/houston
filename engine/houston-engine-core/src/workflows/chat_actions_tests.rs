//! Tests for chat-driven workflow approve/replan markers.

use super::*;
use crate::workflows::defs::create as create_workflow;
use crate::workflows::dispatcher::{
    DispatchOutcome, PlannerContext, StepContext, SynthesisContext, WorkflowDispatcher,
};
use crate::workflows::plan::parse_plan;
use crate::workflows::planner::attach_frozen_plan;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::NewWorkflow;
use async_trait::async_trait;
use houston_ui_events::{DynEventSink, EventSink, HoustonEvent};
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

    async fn dispatch_step(&self, _ctx: StepContext<'_>) -> DispatchOutcome {
        DispatchOutcome {
            response_text: "done".into(),
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

fn approve_marker(run_id: &str) -> String {
    format!(r#"<!--houston:workflow-approve {{"runId":"{run_id}"}}-->"#)
}

fn replan_marker(run_id: &str, feedback: &str) -> String {
    let feedback = feedback.replace('"', "\\\"");
    format!(
        r#"<!--houston:workflow-replan {{"runId":"{run_id}","feedback":"{feedback}"}}-->"#
    )
}

fn sample_workflow() -> NewWorkflow {
    NewWorkflow {
        name: "Audit".into(),
        description: String::new(),
        plan_prompt: "Plan a scan".into(),
        plan: None,
    }
}

fn valid_plan_json() -> String {
    r#"{"steps":[{"id":"a","task":"Step A","depends_on":[],"use_worktree":false,"requires_approval":false,"toolkits":[]}]}"#
        .into()
}

#[test]
fn parse_approve_and_replan_markers() {
    let approve = parse_approve(&approve_marker("run-1")).expect("approve");
    assert_eq!(approve.run_id, "run-1");
    let replan = parse_replan(&replan_marker("run-2", "drop step 3")).expect("replan");
    assert_eq!(replan.run_id, "run-2");
    assert_eq!(replan.feedback, "drop step 3");
}

#[test]
fn parse_workflow_action_prefers_approve() {
    let text = format!(
        "{}\n{}",
        approve_marker("run-1"),
        replan_marker("run-1", "nope")
    );
    assert!(matches!(
        parse_workflow_action(&text),
        Some(WorkflowChatAction::Approve(_))
    ));
}

#[tokio::test]
async fn approve_marker_starts_linked_run() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let run = workflow_runs::create(d.path(), &w.id).unwrap();
    workflow_runs::link_to_chat_session(d.path(), &run.id, "chat-1").unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let setup_events: DynEventSink = recorder.clone();
    attach_frozen_plan(
        &setup_events,
        &agent_path,
        d.path(),
        &run.id,
        &parse_plan(&valid_plan_json()).unwrap(),
    )
    .unwrap();

    let events: DynEventSink = recorder;
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: valid_plan_json(),
            error: None,
        },
    });
    let rt = crate::sessions::SessionRuntime::default();
    maybe_workflow_action_from_chat(
        &events,
        dispatcher,
        rt,
        &agent_path,
        "chat-1",
        Some(&approve_marker(&run.id)),
    )
    .await
    .unwrap();

    let updated = workflow_runs::find_by_id(d.path(), &run.id).unwrap();
    assert_eq!(updated.status, "running");
}

#[tokio::test]
async fn replan_marker_resets_run_to_planning() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let run = workflow_runs::create(d.path(), &w.id).unwrap();
    workflow_runs::link_to_chat_session(d.path(), &run.id, "chat-1").unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let setup_events: DynEventSink = recorder.clone();
    attach_frozen_plan(
        &setup_events,
        &agent_path,
        d.path(),
        &run.id,
        &parse_plan(&valid_plan_json()).unwrap(),
    )
    .unwrap();

    let events: DynEventSink = recorder;
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: valid_plan_json(),
            error: None,
        },
    });
    let rt = crate::sessions::SessionRuntime::default();
    maybe_workflow_action_from_chat(
        &events,
        dispatcher,
        rt,
        &agent_path,
        "chat-1",
        Some(&replan_marker(&run.id, "merge steps 1 and 2")),
    )
    .await
    .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let updated = workflow_runs::find_by_id(d.path(), &run.id).unwrap();
    assert!(
        updated.status == "planning" || updated.status == "awaiting_approval",
        "status={}",
        updated.status
    );
    assert!(updated
        .plan_prompt
        .as_deref()
        .is_some_and(|p| p.contains("merge steps 1 and 2")));
}

#[tokio::test]
async fn rejects_wrong_chat_session() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let run = workflow_runs::create(d.path(), &w.id).unwrap();
    workflow_runs::link_to_chat_session(d.path(), &run.id, "chat-1").unwrap();
    let recorder = Arc::new(Recorder {
        events: Mutex::new(Vec::new()),
    });
    let setup_events: DynEventSink = recorder.clone();
    attach_frozen_plan(
        &setup_events,
        &agent_path,
        d.path(),
        &run.id,
        &parse_plan(&valid_plan_json()).unwrap(),
    )
    .unwrap();

    let events: DynEventSink = recorder;
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: valid_plan_json(),
            error: None,
        },
    });
    let rt = crate::sessions::SessionRuntime::default();
    let err = maybe_workflow_action_from_chat(
        &events,
        dispatcher,
        rt,
        &agent_path,
        "chat-other",
        Some(&approve_marker(&run.id)),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, CoreError::BadRequest(_)));
}
