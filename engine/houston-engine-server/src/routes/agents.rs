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
    activity, config, Activity, ActivityUpdate, NewActivity, ProjectConfig,
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
        .route("/agents/activities", get(list_activities).post(create_activity))
        .route(
            "/agents/activities/:id",
            patch(update_activity).delete(delete_activity),
        )
        // Routines + routine runs are served by the canonical `/routines` +
        // `/routine-runs` surface (see `routes::routines`); this module no
        // longer duplicates them.
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
