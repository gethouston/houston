//! `/v1/agents/*` REST routes — typed CRUD over `.houston/<type>/<type>.json`.
//!
//! Every per-agent route accepts `?agent_path=<absolute-or-tilde-path>`. The
//! path is tilde-expanded server-side and used as the project root passed to
//! `houston_engine_core::agents`.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path as AxPath, Query, State},
    routing::{get, patch},
    Json, Router,
};
use houston_engine_core::agents::{
    activity, config, routine_runs, routines, Activity, ActivityUpdate, NewActivity, NewRoutine,
    ProjectConfig, Routine, RoutineRun, RoutineRunUpdate, RoutineUpdate,
};
use houston_engine_core::paths::expand_tilde;
use houston_engine_core::CoreError;
use houston_ui_events::HoustonEvent;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        // Activities
        .route(
            "/agents/activities",
            get(list_activities).post(create_activity),
        )
        .route(
            "/agents/activities/:id",
            patch(update_activity).delete(delete_activity),
        )
        // Routines
        .route("/agents/routines", get(list_routines).post(create_routine))
        .route(
            "/agents/routines/:id",
            patch(update_routine).delete(delete_routine),
        )
        // Routine runs
        .route(
            "/agents/routine-runs",
            get(list_routine_runs).post(create_routine_run),
        )
        .route("/agents/routine-runs/:id", patch(update_routine_run))
        // Config
        .route("/agents/config", get(get_config).put(set_config))
}

// ---------------------------------------------------------------------------
// Query / body helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AgentQuery {
    pub agent_path: String,
}

#[derive(Deserialize)]
pub struct AgentRoutineQuery {
    pub agent_path: String,
    #[serde(default)]
    pub routine_id: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateRoutineRunBody {
    pub routine_id: String,
}

fn resolve_root(agent_path: &str) -> Result<PathBuf, CoreError> {
    if agent_path.trim().is_empty() {
        return Err(CoreError::BadRequest("agent_path is required".into()));
    }
    Ok(expand_tilde(std::path::Path::new(agent_path)))
}

fn emit(state: &ServerState, event: HoustonEvent) {
    state.engine.events.emit(event);
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

async fn list_activities(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Vec<Activity>>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(activity::list(&root)?))
}

async fn create_activity(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(input): Json<NewActivity>,
) -> Result<Json<Activity>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    houston_engine_core::agents::store::ensure_houston_dir(&root)?;
    let result = activity::create(&root, input)?;
    emit(
        &st,
        HoustonEvent::ActivityChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

async fn update_activity(
    State(st): State<Arc<ServerState>>,
    AxPath(id): AxPath<String>,
    Query(q): Query<AgentQuery>,
    Json(updates): Json<ActivityUpdate>,
) -> Result<Json<Activity>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let result = activity::update(&root, &id, updates)?;
    emit(
        &st,
        HoustonEvent::ActivityChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

async fn delete_activity(
    State(st): State<Arc<ServerState>>,
    AxPath(id): AxPath<String>,
    Query(q): Query<AgentQuery>,
) -> Result<(), ApiError> {
    let root = resolve_root(&q.agent_path)?;
    activity::delete(&root, &id)?;
    emit(
        &st,
        HoustonEvent::ActivityChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

async fn list_routines(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Vec<Routine>>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(routines::list(&root)?))
}

async fn create_routine(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(input): Json<NewRoutine>,
) -> Result<Json<Routine>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    houston_engine_core::agents::store::ensure_houston_dir(&root)?;
    let result = routines::create(&root, input)?;
    st.routine_scheduler.sync_agent(&q.agent_path).await;
    emit(
        &st,
        HoustonEvent::RoutinesChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

async fn update_routine(
    State(st): State<Arc<ServerState>>,
    AxPath(id): AxPath<String>,
    Query(q): Query<AgentQuery>,
    Json(updates): Json<RoutineUpdate>,
) -> Result<Json<Routine>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let result = routines::update(&root, &id, updates)?;
    st.routine_scheduler.sync_agent(&q.agent_path).await;
    emit(
        &st,
        HoustonEvent::RoutinesChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

async fn delete_routine(
    State(st): State<Arc<ServerState>>,
    AxPath(id): AxPath<String>,
    Query(q): Query<AgentQuery>,
) -> Result<(), ApiError> {
    let root = resolve_root(&q.agent_path)?;

    // Cascade: kill any in-flight runs of this routine before removing it,
    // otherwise the spawned provider subprocess keeps burning tokens with
    // no UI handle to stop it. Mirrors the same logic on the sibling
    // `/routines/:id` route. The frontend currently hits THIS path (per
    // `engine-client::deleteRoutine`), so the cascade has to live here too.
    for run in routine_runs::list_for_routine(&root, &id)? {
        if run.status == "running" {
            houston_engine_core::routines::runner::cancel_run(
                &st.engine.sessions,
                &st.engine.events,
                &root,
                &q.agent_path,
                &run.id,
            )
            .await?;
        }
    }

    routines::delete(&root, &id)?;
    st.routine_scheduler.sync_agent(&q.agent_path).await;
    emit(
        &st,
        HoustonEvent::RoutinesChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Routine runs
// ---------------------------------------------------------------------------

async fn list_routine_runs(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentRoutineQuery>,
) -> Result<Json<Vec<RoutineRun>>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let runs = match q.routine_id {
        Some(rid) => routine_runs::list_for_routine(&root, &rid)?,
        None => routine_runs::list(&root)?,
    };
    Ok(Json(runs))
}

async fn create_routine_run(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(body): Json<CreateRoutineRunBody>,
) -> Result<Json<RoutineRun>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    houston_engine_core::agents::store::ensure_houston_dir(&root)?;
    let result = routine_runs::create(&root, &body.routine_id)?;
    emit(
        &st,
        HoustonEvent::RoutineRunsChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

async fn update_routine_run(
    State(st): State<Arc<ServerState>>,
    AxPath(id): AxPath<String>,
    Query(q): Query<AgentQuery>,
    Json(updates): Json<RoutineRunUpdate>,
) -> Result<Json<RoutineRun>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let result = routine_runs::update(&root, &id, updates)?;
    emit(
        &st,
        HoustonEvent::RoutineRunsChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(result))
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async fn get_config(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<ProjectConfig>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(config::read(&root)?))
}

async fn set_config(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(cfg): Json<ProjectConfig>,
) -> Result<Json<ProjectConfig>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    houston_engine_core::agents::store::ensure_houston_dir(&root)?;
    config::write(&root, &cfg)?;
    emit(
        &st,
        HoustonEvent::ConfigChanged {
            agent_path: q.agent_path.clone(),
        },
    );
    Ok(Json(cfg))
}

// Conversations listing lives in `routes::conversations` (/v1/conversations/*)
// — owned by `houston_engine_core::conversations`. Not duplicated here.
