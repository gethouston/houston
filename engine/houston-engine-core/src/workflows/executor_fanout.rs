//! Fan-out loop state and step dispatch for the workflow executor.

use super::FanoutResult;
use crate::error::{CoreError, CoreResult};
use crate::workflows::connections::{missing_connection_blocker, ConnectionChecker};
use crate::workflows::dispatcher::WorkflowDispatcher;
use crate::workflows::executor_sched::{
    cancel_dependents, deps_done, eligible_status, emit_step, failed_dep, is_gated,
    is_run_cancelled, mark_step_awaiting, mark_step_cancelled,
};
use crate::workflows::executor_step::{
    finish_step, spawn_step, StepFinish, StepTaskResult,
};
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{Workflow, WorkflowPlan, WorkflowRun, WorkflowRunUpdate, WorkflowStep};
use houston_ui_events::DynEventSink;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::task::JoinSet;
use tokio::time::{interval, Duration, Interval, MissedTickBehavior};

const REDISPATCH_INTERVAL: Duration = Duration::from_millis(200);

pub(crate) struct FanoutCtx<'a> {
    pub events: &'a DynEventSink,
    pub dispatcher: Arc<dyn WorkflowDispatcher>,
    pub connection_checker: Arc<dyn ConnectionChecker>,
    pub agent_path: &'a str,
    pub root: &'a Path,
    pub workflow: &'a Workflow,
    pub plan: &'a WorkflowPlan,
    pub run_id: &'a str,
    pub resume: bool,
}

pub(crate) struct FanoutState {
    pub join_set: JoinSet<StepTaskResult>,
    pub in_flight: HashSet<String>,
    pub blocked: HashSet<String>,
    composio: ComposioCache,
    pub redispatch_tick: Interval,
}

struct ComposioCache {
    signed_in: Option<bool>,
    connected: Option<HashSet<String>>,
}

impl FanoutState {
    pub fn new() -> Self {
        let mut redispatch_tick = interval(REDISPATCH_INTERVAL);
        redispatch_tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
        Self {
            join_set: JoinSet::new(),
            in_flight: HashSet::new(),
            blocked: HashSet::new(),
            composio: ComposioCache::new(),
            redispatch_tick,
        }
    }

    pub async fn prime_redispatch_tick(&mut self) {
        self.redispatch_tick.tick().await;
    }
}

impl ComposioCache {
    fn new() -> Self {
        Self {
            signed_in: None,
            connected: None,
        }
    }

    async fn ensure_loaded(&mut self, checker: &dyn ConnectionChecker) {
        if self.signed_in.is_none() {
            self.signed_in = Some(checker.composio_signed_in().await);
            self.connected = Some(checker.connected_toolkits().await);
        }
    }
}

pub(crate) async fn drive_fanout(
    ctx: &FanoutCtx<'_>,
    state: &mut FanoutState,
) -> CoreResult<FanoutResult> {
    'fanout: loop {
        if is_run_cancelled(ctx.root, ctx.run_id)? {
            return Ok(FanoutResult {
                all_ok: false,
                paused: false,
            });
        }

        scan_and_dispatch(ctx, state).await?;

        if state.join_set.is_empty() {
            if let Some(result) = idle_outcome(ctx)? {
                return Ok(result);
            }
            break;
        }

        tokio::select! {
            joined = state.join_set.join_next() => {
                let Some(joined) = joined else {
                    break 'fanout;
                };
                let result =
                    joined.map_err(|e| CoreError::Internal(format!("step task failed: {e}")))?;
                on_step_joined(ctx, state, result).await?;
            }
            _ = state.redispatch_tick.tick() => {}
        }
    }

    let run = workflow_runs::find_by_id(ctx.root, ctx.run_id)?;
    Ok(FanoutResult {
        all_ok: run.steps.iter().all(|s| s.status == "done"),
        paused: false,
    })
}

async fn scan_and_dispatch(ctx: &FanoutCtx<'_>, state: &mut FanoutState) -> CoreResult<()> {
    let run = workflow_runs::find_by_id(ctx.root, ctx.run_id)?;
    for step in &ctx.plan.steps {
        evaluate_and_dispatch_step(ctx, state, step, &run).await?;
    }
    Ok(())
}

async fn evaluate_and_dispatch_step(
    ctx: &FanoutCtx<'_>,
    state: &mut FanoutState,
    step: &WorkflowStep,
    run: &WorkflowRun,
) -> CoreResult<()> {
    if state.in_flight.contains(&step.id) || state.blocked.contains(&step.id) {
        return Ok(());
    }

    let status = step_status(run, &step.id);
    if !eligible_status(status, ctx.resume) || !deps_done(step, &run.steps) {
        return Ok(());
    }

    if failed_dep(step, &run.steps) {
        mark_step_cancelled(
            ctx.events,
            ctx.agent_path,
            ctx.root,
            ctx.run_id,
            &step.id,
            "blocked by failed dependency",
        )?;
        state.blocked.insert(step.id.clone());
        return Ok(());
    }

    if is_gated(step, &run.steps) {
        if status != "awaiting_approval" {
            mark_step_awaiting(ctx.events, ctx.agent_path, ctx.root, ctx.run_id, &step.id)?;
        }
        return Ok(());
    }

    if !step.toolkits.is_empty() {
        state
            .composio
            .ensure_loaded(ctx.connection_checker.as_ref())
            .await;
        if let Some(blocker) = missing_connection_blocker(
            state.composio.signed_in.unwrap(),
            state.composio.connected.as_ref().unwrap(),
            &step.toolkits,
        ) {
            block_for_connection(ctx, state, step, blocker)?;
            return Ok(());
        }
    }

    dispatch_step(ctx, state, step)?;
    Ok(())
}

fn step_status<'a>(run: &'a WorkflowRun, step_id: &str) -> &'a str {
    run.steps
        .iter()
        .find(|s| s.step_id == step_id)
        .map(|s| s.status.as_str())
        .unwrap_or("pending")
}

fn block_for_connection(
    ctx: &FanoutCtx<'_>,
    state: &mut FanoutState,
    step: &WorkflowStep,
    blocker: crate::workflows::types::WorkflowConnectionBlocker,
) -> CoreResult<()> {
    workflow_runs::patch_step(ctx.root, ctx.run_id, &step.id, |s| {
        s.status = "waiting_for_connection".into();
        s.summary = None;
        s.blocker = Some(blocker.clone());
    })?;
    emit_step(ctx.events, ctx.agent_path, ctx.run_id, &step.id);
    emit_runs_changed(ctx.events, ctx.agent_path);
    state.blocked.insert(step.id.clone());
    Ok(())
}

fn dispatch_step(
    ctx: &FanoutCtx<'_>,
    state: &mut FanoutState,
    step: &WorkflowStep,
) -> CoreResult<()> {
    state.in_flight.insert(step.id.clone());
    workflow_runs::patch_step(ctx.root, ctx.run_id, &step.id, |s| {
        s.status = "running".into();
        s.blocker = None;
    })?;
    emit_step(ctx.events, ctx.agent_path, ctx.run_id, &step.id);
    emit_runs_changed(ctx.events, ctx.agent_path);
    spawn_step(
        &mut state.join_set,
        ctx.dispatcher.clone(),
        ctx.agent_path.to_string(),
        ctx.root.to_path_buf(),
        ctx.workflow.clone(),
        ctx.run_id.to_string(),
        step.clone(),
    );
    Ok(())
}

fn idle_outcome(ctx: &FanoutCtx<'_>) -> CoreResult<Option<FanoutResult>> {
    let run = workflow_runs::find_by_id(ctx.root, ctx.run_id)?;
    if run
        .steps
        .iter()
        .any(|s| s.status == "waiting_for_connection")
    {
        return pause_run(ctx, "waiting_for_connection").map(Some);
    }
    if run.steps.iter().any(|s| s.status == "awaiting_approval") {
        return pause_run(ctx, "awaiting_approval").map(Some);
    }
    Ok(None)
}

fn pause_run(ctx: &FanoutCtx<'_>, run_status: &str) -> CoreResult<FanoutResult> {
    workflow_runs::update(
        ctx.root,
        ctx.run_id,
        WorkflowRunUpdate {
            status: Some(run_status.into()),
            ..Default::default()
        },
    )?;
    emit_runs_changed(ctx.events, ctx.agent_path);
    Ok(FanoutResult {
        all_ok: false,
        paused: true,
    })
}

async fn on_step_joined(
    ctx: &FanoutCtx<'_>,
    state: &mut FanoutState,
    result: StepTaskResult,
) -> CoreResult<()> {
    state.in_flight.remove(&result.step_id);
    let failed_step = result.step_id.clone();
    match finish_step(
        ctx.events,
        ctx.agent_path,
        ctx.root,
        ctx.run_id,
        ctx.workflow,
        ctx.dispatcher.clone(),
        result,
    )
    .await?
    {
        StepFinish::Done | StepFinish::WaitingForConnection => {}
        StepFinish::Failed => {
            cancel_dependents(
                ctx.events,
                ctx.agent_path,
                ctx.root,
                ctx.run_id,
                ctx.plan,
                &failed_step,
                &mut state.blocked,
            )?;
        }
    }
    Ok(())
}
