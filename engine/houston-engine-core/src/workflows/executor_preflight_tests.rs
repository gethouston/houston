//! Pre-flight Composio connection gate tests for the workflow executor.

use crate::sessions::SessionRuntime;
use crate::workflows::connections::{ConnectionChecker, FakeConnectionChecker};
use crate::workflows::defs::create as create_workflow;
use crate::workflows::dispatcher::{
    DispatchOutcome, PlannerContext, StepContext, SynthesisContext, WorkflowDispatcher,
};
use crate::workflows::executor;
use crate::workflows::plan::parse_plan;
use crate::workflows::runner::begin_run;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{
    NewWorkflow, StepState, Workflow, WorkflowConnectionBlocker, WorkflowRunUpdate,
};
use async_trait::async_trait;
use houston_ui_events::{DynEventSink, NoopEventSink};
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

struct ScriptedDispatcher {
    steps: HashMap<String, DispatchOutcome>,
    order: Mutex<Vec<String>>,
}

#[async_trait]
impl WorkflowDispatcher for ScriptedDispatcher {
    async fn dispatch_planner(&self, _ctx: PlannerContext<'_>) -> DispatchOutcome {
        DispatchOutcome::default()
    }

    async fn dispatch_step(&self, ctx: StepContext<'_>) -> DispatchOutcome {
        self.order.lock().unwrap().push(ctx.step.id.clone());
        self.steps
            .get(&ctx.step.id)
            .cloned()
            .unwrap_or_else(|| DispatchOutcome {
                response_text: format!("done {}", ctx.step.id),
                error: None,
            })
    }

    async fn dispatch_synthesis(&self, _ctx: SynthesisContext<'_>) -> DispatchOutcome {
        DispatchOutcome::default()
    }
}

async fn setup_running_plan(
    d: &TempDir,
    plan_json: &str,
) -> (String, Workflow, String, Arc<ScriptedDispatcher>) {
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(
        d.path(),
        NewWorkflow {
            name: "Drive".into(),
            description: String::new(),
            plan_prompt: "Plan".into(),
            plan: None,
        },
    )
    .unwrap();
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_run(&events, &agent_path, &w.id).unwrap();
    let plan = parse_plan(plan_json).unwrap();
    let steps: Vec<StepState> = plan
        .steps
        .iter()
        .map(|s| StepState {
            step_id: s.id.clone(),
            status: "pending".into(),
            approved: false,
            summary: None,
            worktree_path: None,
            blocker: None,
        })
        .collect();
    workflow_runs::update(
        d.path(),
        &begun.run.id,
        WorkflowRunUpdate {
            status: Some("running".into()),
            plan: Some(plan),
            steps: Some(steps),
            ..Default::default()
        },
    )
    .unwrap();
    let dispatcher = Arc::new(ScriptedDispatcher {
        steps: HashMap::new(),
        order: Mutex::new(Vec::new()),
    });
    (agent_path, begun.workflow, begun.run.id, dispatcher)
}

#[tokio::test]
async fn preflight_blocks_missing_toolkit() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[
      {"id":"folder","task":"create Drive folder","toolkits":["googledrive"]},
      {"id":"doc","task":"create Google Doc","depends_on":["folder"],"toolkits":["googledocs"]}
    ]}"#;
    let (agent_path, workflow, run_id, dispatcher) = setup_running_plan(&d, json).await;
    let checker: Arc<dyn ConnectionChecker> = Arc::new(FakeConnectionChecker {
        signed_in: true,
        connected: HashSet::new(),
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let fanout = executor::run_fanout(
        &events,
        dispatcher.clone(),
        &SessionRuntime::default(),
        checker,
        &agent_path,
        d.path(),
        &workflow,
        &run_id,
        false,
    )
    .await
    .unwrap();
    assert!(fanout.paused);
    let run = workflow_runs::find_by_id(d.path(), &run_id).unwrap();
    assert_eq!(run.status, "waiting_for_connection");
    let folder = run.steps.iter().find(|s| s.step_id == "folder").unwrap();
    assert_eq!(folder.status, "waiting_for_connection");
    assert_eq!(
        folder.blocker,
        Some(WorkflowConnectionBlocker::ComposioToolkit {
            toolkit: "googledrive".into()
        })
    );
    let doc = run.steps.iter().find(|s| s.step_id == "doc").unwrap();
    assert_eq!(doc.status, "pending");
    assert!(dispatcher.order.lock().unwrap().is_empty());
}

#[tokio::test]
async fn preflight_blocks_when_not_signed_in() {
    let d = TempDir::new().unwrap();
    let json =
        r#"{"steps":[{"id":"send","task":"send email","toolkits":["gmail"]}]}"#;
    let (agent_path, workflow, run_id, dispatcher) = setup_running_plan(&d, json).await;
    let checker: Arc<dyn ConnectionChecker> = Arc::new(FakeConnectionChecker {
        signed_in: false,
        connected: HashSet::new(),
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    executor::run_fanout(
        &events,
        dispatcher,
        &SessionRuntime::default(),
        checker,
        &agent_path,
        d.path(),
        &workflow,
        &run_id,
        false,
    )
    .await
    .unwrap();
    let run = workflow_runs::find_by_id(d.path(), &run_id).unwrap();
    let step = run.steps.iter().find(|s| s.step_id == "send").unwrap();
    assert_eq!(step.status, "waiting_for_connection");
    assert_eq!(step.blocker, Some(WorkflowConnectionBlocker::ComposioSignin));
}

#[tokio::test]
async fn preflight_dispatches_when_toolkits_connected() {
    let d = TempDir::new().unwrap();
    let json =
        r#"{"steps":[{"id":"folder","task":"create Drive folder","toolkits":["googledrive"]}]}"#;
    let (agent_path, workflow, run_id, dispatcher) = setup_running_plan(&d, json).await;
    let mut connected = HashSet::new();
    connected.insert("googledrive".into());
    let checker: Arc<dyn ConnectionChecker> = Arc::new(FakeConnectionChecker {
        signed_in: true,
        connected,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    executor::run_fanout(
        &events,
        dispatcher.clone(),
        &SessionRuntime::default(),
        checker,
        &agent_path,
        d.path(),
        &workflow,
        &run_id,
        false,
    )
    .await
    .unwrap();
    assert_eq!(&*dispatcher.order.lock().unwrap(), &["folder".to_string()]);
    let run = workflow_runs::find_by_id(d.path(), &run_id).unwrap();
    let step = run.steps.iter().find(|s| s.step_id == "folder").unwrap();
    assert_eq!(step.status, "done");
}
