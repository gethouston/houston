//! `/v1/workflows` + `/v1/workflow-runs` REST routes.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::{get, patch, post},
    Json, Router,
};
use houston_engine_core::paths::expand_tilde;
use houston_engine_core::workflows::{
    self,
    engine_dispatcher::EngineWorkflowDispatcher,
    promote::save_run_as_workflow,
    runner::{approve_run, begin_run, cancel_run, resume_run, retry_step as retry_workflow_step, start_planning},
    types::{NewWorkflow, Workflow, WorkflowRun, WorkflowUpdate},
};
use houston_ui_events::HoustonEvent;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Deserialize)]
struct AgentQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
}

#[derive(Deserialize)]
struct RunsQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
    #[serde(rename = "workflowId", default)]
    workflow_id: Option<String>,
}

fn agent_root(p: &str) -> PathBuf {
    expand_tilde(std::path::Path::new(p))
}

fn make_dispatcher(st: &Arc<ServerState>) -> EngineWorkflowDispatcher {
    EngineWorkflowDispatcher {
        rt: st.engine.sessions.clone(),
        events: st.engine.events.clone(),
        db: st.engine.db.clone(),
        app_system_prompt: st.engine.app_system_prompt.clone(),
    }
}

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/workflows", get(list).post(create))
        .route("/workflows/:id", patch(update).delete(remove))
        .route("/workflow-runs", get(list_runs))
        .route("/workflows/:id/run", post(run_workflow))
        .route("/workflow-runs/:id/approve", post(approve))
        .route("/workflow-runs/:id/cancel", post(cancel))
        .route("/workflow-runs/:id/resume", post(resume))
        .route("/workflow-runs/:id/steps/:step_id/retry", post(retry_step))
        .route("/workflow-runs/:id/save-as-workflow", post(save_as_workflow))
}

async fn list(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Vec<Workflow>>, ApiError> {
    Ok(Json(workflows::list_workflows(&agent_root(&q.agent_path))?))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(req): Json<NewWorkflow>,
) -> Result<Json<Workflow>, ApiError> {
    let w = workflows::create_workflow(&agent_root(&q.agent_path), req)?;
    st.engine.events.emit(HoustonEvent::WorkflowsChanged {
        agent_path: q.agent_path.clone(),
    });
    Ok(Json(w))
}

async fn update(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
    Json(req): Json<WorkflowUpdate>,
) -> Result<Json<Workflow>, ApiError> {
    let w = workflows::update_workflow(&agent_root(&q.agent_path), &id, req)?;
    st.engine.events.emit(HoustonEvent::WorkflowsChanged {
        agent_path: q.agent_path.clone(),
    });
    Ok(Json(w))
}

async fn remove(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<(), ApiError> {
    let root = agent_root(&q.agent_path);
    for run in workflows::list_for_workflow(&root, &id)? {
        if matches!(run.status.as_str(), "planning" | "awaiting_approval" | "running") {
            cancel_run(
                &st.engine.sessions,
                &st.engine.events,
                &root,
                &q.agent_path,
                &run.id,
            )
            .await?;
        }
    }
    workflows::delete_workflow(&root, &id)?;
    st.engine.events.emit(HoustonEvent::WorkflowsChanged {
        agent_path: q.agent_path.clone(),
    });
    Ok(())
}

async fn list_runs(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<RunsQuery>,
) -> Result<Json<Vec<WorkflowRun>>, ApiError> {
    let root = agent_root(&q.agent_path);
    let runs = match q.workflow_id {
        Some(wid) => workflows::list_for_workflow(&root, &wid)?,
        None => workflows::list_workflow_runs(&root)?,
    };
    Ok(Json(runs))
}

async fn run_workflow(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<WorkflowRun>, ApiError> {
    let events = st.engine.events.clone();
    let begun = begin_run(&events, &q.agent_path, &id)?;
    let run = begun.run.clone();
    let dispatcher: Arc<dyn workflows::dispatcher::WorkflowDispatcher> =
        Arc::new(make_dispatcher(&st));
    let agent_path = q.agent_path.clone();
    tokio::spawn(async move {
        if let Err(e) = start_planning(events, dispatcher, &agent_path, begun).await {
            tracing::error!("[workflows] planning failed for workflow {id}: {e}");
        }
    });
    Ok(Json(run))
}

async fn save_as_workflow(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Workflow>, ApiError> {
    let w = save_run_as_workflow(&agent_root(&q.agent_path), &id)?;
    let agent_path = q.agent_path.clone();
    st.engine.events.emit(HoustonEvent::WorkflowsChanged {
        agent_path: agent_path.clone(),
    });
    st.engine.events.emit(HoustonEvent::WorkflowRunsChanged { agent_path });
    Ok(Json(w))
}

async fn approve(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<WorkflowRun>, ApiError> {
    let dispatcher: Arc<dyn workflows::dispatcher::WorkflowDispatcher> =
        Arc::new(make_dispatcher(&st));
    let updated = approve_run(
        st.engine.events.clone(),
        dispatcher,
        st.engine.sessions.clone(),
        &q.agent_path,
        &agent_root(&q.agent_path),
        &id,
    )
    .await?;
    Ok(Json(updated))
}

async fn cancel(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<WorkflowRun>, ApiError> {
    let updated = cancel_run(
        &st.engine.sessions,
        &st.engine.events,
        &agent_root(&q.agent_path),
        &q.agent_path,
        &id,
    )
    .await?;
    Ok(Json(updated))
}

async fn resume(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<(), ApiError> {
    let dispatcher: Arc<dyn workflows::dispatcher::WorkflowDispatcher> =
        Arc::new(make_dispatcher(&st));
    resume_run(
        st.engine.events.clone(),
        dispatcher,
        st.engine.sessions.clone(),
        &q.agent_path,
        &agent_root(&q.agent_path),
        &id,
    )
    .await?;
    Ok(())
}

async fn retry_step(
    State(st): State<Arc<ServerState>>,
    Path((id, step_id)): Path<(String, String)>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<WorkflowRun>, ApiError> {
    let dispatcher: Arc<dyn workflows::dispatcher::WorkflowDispatcher> =
        Arc::new(make_dispatcher(&st));
    let updated = retry_workflow_step(
        st.engine.events.clone(),
        dispatcher,
        st.engine.sessions.clone(),
        &q.agent_path,
        &agent_root(&q.agent_path),
        &id,
        &step_id,
    )
    .await?;
    Ok(Json(updated))
}
