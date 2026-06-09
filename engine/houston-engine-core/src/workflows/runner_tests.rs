//! Integration-style tests for the workflow runner and executor.

use crate::workflows::defs::create as create_workflow;
use crate::workflows::dispatcher::{
    DispatchOutcome, PlannerContext, StepContext, SynthesisContext, WorkflowDispatcher,
};
use crate::workflows::executor;
use crate::workflows::keys::step_session_key;
use crate::workflows::plan::parse_plan;
use crate::workflows::inline::begin_inline_run;
use crate::workflows::runner::{approve_run, begin_run, cancel_run, finish_planning, resume_run};
use crate::workflows::types::{BegunRun, InlineRunSpec};
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{NewWorkflow, StepState, WorkflowRunUpdate};
use crate::sessions::SessionRuntime;
use async_trait::async_trait;
use houston_ui_events::{DynEventSink, NoopEventSink};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

struct ScriptedDispatcher {
    planner: DispatchOutcome,
    steps: HashMap<String, DispatchOutcome>,
    synthesis: DispatchOutcome,
    order: Mutex<Vec<String>>,
    prompts: Mutex<HashMap<String, String>>,
    active: AtomicUsize,
    peak: AtomicUsize,
    delay_ms: u64,
}

#[async_trait]
impl WorkflowDispatcher for ScriptedDispatcher {
    async fn dispatch_planner(&self, _ctx: PlannerContext<'_>) -> DispatchOutcome {
        self.planner.clone()
    }

    async fn dispatch_step(&self, ctx: StepContext<'_>) -> DispatchOutcome {
        let n = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak.fetch_max(n, Ordering::SeqCst);
        if self.delay_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.delay_ms)).await;
        }
        self.active.fetch_sub(1, Ordering::SeqCst);
        self.order
            .lock()
            .unwrap()
            .push(ctx.step.id.clone());
        self.prompts
            .lock()
            .unwrap()
            .insert(ctx.step.id.clone(), ctx.prompt.to_string());
        self.steps
            .get(&ctx.step.id)
            .cloned()
            .unwrap_or_else(|| DispatchOutcome {
                response_text: format!("done {}", ctx.step.id),
                error: None,
            })
    }

    async fn dispatch_synthesis(&self, _ctx: SynthesisContext<'_>) -> DispatchOutcome {
        self.synthesis.clone()
    }
}

fn sample_workflow() -> NewWorkflow {
    NewWorkflow {
        name: "Audit".into(),
        description: String::new(),
        plan_prompt: "Plan a scan".into(),
    }
}

fn valid_plan_json() -> &'static str {
    r#"{"steps":[
      {"id":"a","task":"first"},
      {"id":"b","task":"second","depends_on":["a"]}
    ]}"#
}

async fn setup_planned_run(
    d: &TempDir,
    planner_json: &str,
) -> (String, BegunRun, Arc<ScriptedDispatcher>) {
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: planner_json.into(),
            error: None,
        },
        steps: HashMap::new(),
        synthesis: DispatchOutcome {
            response_text: "all good".into(),
            error: None,
        },
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 0,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_run(&events, &agent_path, &w.id).unwrap();
    finish_planning(
        events,
        dispatcher.clone(),
        &agent_path,
        BegunRun {
            working_dir: begun.working_dir.clone(),
            workflow: begun.workflow.clone(),
            run: begun.run.clone(),
        },
    )
    .await
    .unwrap();
    (agent_path, begun, dispatcher)
}

async fn setup_planned_inline_run(
    d: &TempDir,
    planner_json: &str,
) -> (String, BegunRun, Arc<ScriptedDispatcher>) {
    let agent_path = d.path().to_string_lossy().to_string();
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: planner_json.into(),
            error: None,
        },
        steps: HashMap::new(),
        synthesis: DispatchOutcome {
            response_text: "all good".into(),
            error: None,
        },
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 0,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_inline_run(
        &events,
        &agent_path,
        InlineRunSpec {
            plan_prompt: "Plan a scan".into(),
            name: Some("Inline audit".into()),
            description: None,
        },
    )
    .unwrap();
    finish_planning(
        events,
        dispatcher.clone(),
        &agent_path,
        BegunRun {
            working_dir: begun.working_dir.clone(),
            workflow: begun.workflow.clone(),
            run: begun.run.clone(),
        },
    )
    .await
    .unwrap();
    (agent_path, begun, dispatcher)
}

#[test]
fn plan_parse_failure_drives_error() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: "not json".into(),
            error: None,
        },
        steps: HashMap::new(),
        synthesis: DispatchOutcome::default(),
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 0,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_run(&events, &agent_path, &w.id).unwrap();
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(finish_planning(events, dispatcher, &agent_path, begun))
        .unwrap();
    let runs = workflow_runs::list(d.path()).unwrap();
    assert_eq!(runs[0].status, "error");
    assert!(runs[0].summary.is_some());
}

#[test]
fn planner_dispatch_error_surfaces_provider_message() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let quota_msg = "You've hit your usage limit. Upgrade to Plus to continue using Codex.";
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: String::new(),
            error: Some(quota_msg.into()),
        },
        steps: HashMap::new(),
        synthesis: DispatchOutcome::default(),
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 0,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_run(&events, &agent_path, &w.id).unwrap();
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(finish_planning(events, dispatcher, &agent_path, begun))
        .unwrap();
    let runs = workflow_runs::list(d.path()).unwrap();
    assert_eq!(runs[0].status, "error");
    assert_eq!(runs[0].summary.as_deref(), Some(quota_msg));
}

#[tokio::test]
async fn approval_gate_rejects_wrong_status() {
    let d = TempDir::new().unwrap();
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let run = workflow_runs::create(d.path(), &w.id).unwrap();
    let dispatcher: Arc<dyn WorkflowDispatcher> = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome::default(),
        steps: HashMap::new(),
        synthesis: DispatchOutcome::default(),
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 0,
    });
    let err = approve_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher,
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &run.id,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, crate::CoreError::Conflict(_)));
}

#[tokio::test]
async fn inline_run_plans_approves_and_executes() {
    let d = TempDir::new().unwrap();
    let (agent_path, begun, dispatcher) = setup_planned_inline_run(&d, valid_plan_json()).await;
    assert!(begun.run.workflow_id.starts_with("inline-"));
    assert_eq!(begun.workflow.name, "Inline audit");
    assert_eq!(begun.workflow.plan_prompt, "Plan a scan");

    approve_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher,
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
    assert_eq!(run.status, "done");
}

#[tokio::test]
async fn inline_run_resume_skips_done_steps() {
    let d = TempDir::new().unwrap();
    let (agent_path, begun, dispatcher) = setup_planned_inline_run(&d, valid_plan_json()).await;
    let plan = parse_plan(valid_plan_json()).unwrap();
    workflow_runs::update(
        d.path(),
        &begun.run.id,
        WorkflowRunUpdate {
            status: Some("error".into()),
            plan: Some(plan),
            steps: Some(vec![
                StepState {
                    step_id: "a".into(),
                    status: "done".into(),
                    approved: false,
                    summary: Some("ok".into()),
                    worktree_path: None,
                },
                StepState {
                    step_id: "b".into(),
                    status: "error".into(),
                    approved: false,
                    summary: Some("boom".into()),
                    worktree_path: None,
                },
            ]),
            ..Default::default()
        },
    )
    .unwrap();
    resume_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();
    let order = dispatcher.order.lock().unwrap().clone();
    assert!(!order.contains(&"a".to_string()));
    assert!(order.contains(&"b".to_string()));
}

#[tokio::test]
async fn dependency_ordering_honored() {
    let d = TempDir::new().unwrap();
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, valid_plan_json()).await;
    approve_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let order = dispatcher.order.lock().unwrap().clone();
    let pos_a = order.iter().position(|id| id == "a").expect("a ran");
    let pos_b = order.iter().position(|id| id == "b").expect("b ran");
    assert!(pos_a < pos_b, "b must start after a: {order:?}");
    let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
    assert_eq!(run.status, "done");
}

#[tokio::test]
async fn independent_steps_can_overlap() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[
      {"id":"x","task":"one"},
      {"id":"y","task":"two"}
    ]}"#;
    let agent_path = d.path().to_string_lossy().to_string();
    let w = create_workflow(d.path(), sample_workflow()).unwrap();
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome {
            response_text: json.into(),
            error: None,
        },
        steps: HashMap::new(),
        synthesis: DispatchOutcome {
            response_text: "ok".into(),
            error: None,
        },
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 40,
    });
    let events: DynEventSink = Arc::new(NoopEventSink);
    let begun = begin_run(&events, &agent_path, &w.id).unwrap();
    finish_planning(
        events.clone(),
        dispatcher.clone(),
        &agent_path,
        BegunRun {
            working_dir: begun.working_dir.clone(),
            workflow: begun.workflow.clone(),
            run: begun.run.clone(),
        },
    )
    .await
    .unwrap();
    let begun = begun;
    approve_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    assert!(
        dispatcher.peak.load(Ordering::SeqCst) >= 2,
        "independent steps should overlap"
    );
}

#[tokio::test]
async fn cancel_marks_terminal() {
    let d = TempDir::new().unwrap();
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, valid_plan_json()).await;
    workflow_runs::update(
        d.path(),
        &begun.run.id,
        WorkflowRunUpdate {
            status: Some("running".into()),
            plan: Some(parse_plan(valid_plan_json()).unwrap()),
            ..Default::default()
        },
    )
    .unwrap();
    let rt = SessionRuntime::default();
    let events: DynEventSink = Arc::new(NoopEventSink);
    let updated = cancel_run(
        &rt,
        &events,
        d.path(),
        &agent_path,
        &begun.run.id,
    )
    .await
    .unwrap();
    assert_eq!(updated.status, "cancelled");
    drop(dispatcher);
}

#[tokio::test]
async fn resume_skips_done_steps() {
    let d = TempDir::new().unwrap();
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, valid_plan_json()).await;
    let plan = parse_plan(valid_plan_json()).unwrap();
    workflow_runs::update(
        d.path(),
        &begun.run.id,
        WorkflowRunUpdate {
            status: Some("error".into()),
            plan: Some(plan),
            steps: Some(vec![
                StepState {
                    step_id: "a".into(),
                    status: "done".into(),
                    approved: false,
                    summary: Some("ok".into()),
                    worktree_path: None,
                },
                StepState {
                    step_id: "b".into(),
                    status: "error".into(),
                    approved: false,
                    summary: Some("boom".into()),
                    worktree_path: None,
                },
            ]),
            ..Default::default()
        },
    )
    .unwrap();
    resume_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();
    let order = dispatcher.order.lock().unwrap().clone();
    assert!(!order.contains(&"a".to_string()), "done step must be skipped");
    assert!(order.contains(&"b".to_string()));
}

#[tokio::test]
async fn executor_cancelled_mid_run_stops() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[{"id":"slow","task":"wait"}]}"#;
    let (agent_path, begun, _) = setup_planned_run(&d, json).await;
    let plan = parse_plan(json).unwrap();
    workflow_runs::update(
        d.path(),
        &begun.run.id,
        WorkflowRunUpdate {
            status: Some("running".into()),
            plan: Some(plan),
            ..Default::default()
        },
    )
    .unwrap();
    let events: DynEventSink = Arc::new(NoopEventSink);
    let dispatcher = Arc::new(ScriptedDispatcher {
        planner: DispatchOutcome::default(),
        steps: HashMap::new(),
        synthesis: DispatchOutcome::default(),
        order: Mutex::new(Vec::new()),
        prompts: Mutex::new(HashMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        delay_ms: 200,
    });
    let rt = SessionRuntime::default();
    let root = d.path().to_path_buf();
    let wf = begun.workflow.clone();
    let run_id = begun.run.id.clone();
    let agent_path_clone = agent_path.clone();
    let events_fanout = events.clone();
    let handle = tokio::spawn(async move {
        executor::run_fanout(
            &events_fanout,
            dispatcher,
            &rt,
            &agent_path_clone,
            &root,
            &wf,
            &run_id,
            false,
        )
        .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    cancel_run(
        &SessionRuntime::default(),
        &events,
        d.path(),
        &agent_path,
        &begun.run.id,
    )
    .await
    .unwrap();
    handle.await.unwrap().unwrap();
    let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
    assert_eq!(run.status, "cancelled");
}

#[tokio::test]
async fn gated_step_pauses_run_for_midrun_approval() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[
      {"id":"research","task":"research competitors"},
      {"id":"write","task":"create Google Doc","depends_on":["research"],"requires_approval":true}
    ]}"#;
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, json).await;
    approve_run(
        Arc::new(NoopEventSink) as DynEventSink,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
        if run.status == "awaiting_approval" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not pause at approval gate: status={}", run.status);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
    let research = run.steps.iter().find(|s| s.step_id == "research").unwrap();
    let write = run.steps.iter().find(|s| s.step_id == "write").unwrap();
    assert_eq!(research.status, "done");
    assert_eq!(write.status, "awaiting_approval");
    let order = dispatcher.order.lock().unwrap();
    assert!(!order.contains(&"write".to_string()), "gated step must not dispatch");
}

#[tokio::test]
async fn midrun_approve_resumes_gated_step() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[
      {"id":"research","task":"research competitors"},
      {"id":"write","task":"create Google Doc","depends_on":["research"],"requires_approval":true}
    ]}"#;
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, json).await;
    let events: DynEventSink = Arc::new(NoopEventSink);
    approve_run(
        events.clone(),
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
        if run.status == "awaiting_approval" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not pause at approval gate");
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    approve_run(
        events,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
        if run.status == "done" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not finish after mid-run approval: status={}", run.status);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let order = dispatcher.order.lock().unwrap();
    assert!(order.contains(&"write".to_string()));
    let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
    let write = run.steps.iter().find(|s| s.step_id == "write").unwrap();
    assert_eq!(write.status, "done");
    assert!(write.approved);
}

#[tokio::test]
async fn approved_gated_step_prompt_includes_context() {
    let d = TempDir::new().unwrap();
    let json = r#"{"steps":[
      {"id":"research","task":"research competitors"},
      {"id":"write","task":"create Google Doc","depends_on":["research"],"requires_approval":true}
    ]}"#;
    let (agent_path, begun, dispatcher) = setup_planned_run(&d, json).await;
    let events: DynEventSink = Arc::new(NoopEventSink);
    approve_run(
        events.clone(),
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
        if run.status == "awaiting_approval" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not pause at approval gate");
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    approve_run(
        events,
        dispatcher.clone(),
        SessionRuntime::default(),
        &agent_path,
        d.path(),
        &begun.run.id,
    )
    .await
    .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let run = workflow_runs::find_by_id(d.path(), &begun.run.id).unwrap();
        if run.status == "done" {
            break;
        }
        if std::time::Instant::now() >= deadline {
            panic!("run did not finish after mid-run approval: status={}", run.status);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let prompts = dispatcher.prompts.lock().unwrap();
    let write_prompt = prompts.get("write").expect("write step prompt captured");
    assert!(write_prompt.contains("already approved this action"));
    assert!(write_prompt.contains("done research"));
}

#[test]
fn step_session_keys_are_stable() {
    assert_eq!(
        step_session_key("wf", "run", "s1"),
        "workflow-wf-run-run-step-s1"
    );
}

#[tokio::test]
async fn cancel_removes_persisted_worktree() {
    use crate::worktree::{CreateWorktreeRequest, RemoveWorktreeRequest};
    use tokio::process::Command;

    async fn git(dir: &std::path::Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .await
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    let d = TempDir::new().unwrap();
    let agent = d.path().to_path_buf();
    git(&agent, &["init", "-b", "main"]).await;
    git(&agent, &["config", "user.email", "t@t.t"]).await;
    git(&agent, &["config", "user.name", "T"]).await;
    git(&agent, &["config", "commit.gpgsign", "false"]).await;
    std::fs::write(agent.join("README.md"), "x").unwrap();
    git(&agent, &["add", "."]).await;
    git(&agent, &["commit", "-m", "init"]).await;

    let w = create_workflow(&agent, sample_workflow()).unwrap();
    let run = workflow_runs::create(&agent, &w.id).unwrap();
    let created = crate::worktree::create_worktree(CreateWorktreeRequest {
        repo_path: agent.to_string_lossy().to_string(),
        name: "wf-cancel".into(),
        branch: None,
    })
    .await
    .unwrap();
    let wt_path = std::path::PathBuf::from(&created.path);
    assert!(wt_path.exists());

    workflow_runs::update(
        &agent,
        &run.id,
        WorkflowRunUpdate {
            status: Some("running".into()),
            steps: Some(vec![StepState {
                step_id: "wt".into(),
                status: "running".into(),
                approved: false,
                summary: None,
                worktree_path: Some(created.path.clone()),
            }]),
            ..Default::default()
        },
    )
    .unwrap();

    let agent_path = agent.to_string_lossy().to_string();
    let events: DynEventSink = Arc::new(NoopEventSink);
    cancel_run(
        &SessionRuntime::default(),
        &events,
        &agent,
        &agent_path,
        &run.id,
    )
    .await
    .unwrap();

    assert!(!wt_path.exists());
    let updated = workflow_runs::find_by_id(&agent, &run.id).unwrap();
    assert_eq!(updated.status, "cancelled");

    // Idempotent cleanup must not error if path is already gone.
    crate::worktree::remove_worktree(RemoveWorktreeRequest {
        repo_path: agent.to_string_lossy().to_string(),
        worktree_path: created.path,
    })
    .await
    .unwrap_err();
}
