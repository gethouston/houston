//! `/v1/skills` REST routes.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::skills::{
    self, CreateSkillRequest, InstallCommunityRequest, InstallFromRepoRequest, SaveSkillRequest,
    SkillDetailResponse, SkillSummaryResponse,
};
use houston_skills::remote::{CommunitySkill, RepoSkill};
use serde::Deserialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/skills", get(list).post(create))
        .route("/skills/:name", get(load).put(save).delete(remove))
        .route("/skills/community/search", post(community_search))
        .route("/skills/community/popular", post(community_popular))
        .route("/skills/community/install", post(community_install))
        .route("/skills/repo/list", post(repo_list))
        .route("/skills/repo/install", post(repo_install))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceQuery {
    workspace_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoListRequest {
    source: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommunitySearchRequest {
    query: String,
}

async fn list(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<WorkspaceQuery>,
) -> Result<Json<Vec<SkillSummaryResponse>>, ApiError> {
    Ok(Json(skills::list(&q.workspace_path)?))
}

async fn load(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Result<Json<SkillDetailResponse>, ApiError> {
    Ok(Json(skills::load(&q.workspace_path, &name)?))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<CreateSkillRequest>,
) -> Result<(), ApiError> {
    skills::create(&st.engine.events, req)?;
    Ok(())
}

async fn save(
    State(st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Json(req): Json<SaveSkillRequest>,
) -> Result<(), ApiError> {
    skills::save(&st.engine.events, &name, req)?;
    Ok(())
}

async fn remove(
    State(st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Query(q): Query<WorkspaceQuery>,
) -> Result<(), ApiError> {
    skills::delete(&st.engine.events, &q.workspace_path, &name)?;
    Ok(())
}

async fn community_search(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<CommunitySearchRequest>,
) -> Result<Json<Vec<CommunitySkill>>, ApiError> {
    Ok(Json(skills::search_community(&req.query).await?))
}

async fn community_popular(
    State(_st): State<Arc<ServerState>>,
) -> Result<Json<Vec<CommunitySkill>>, ApiError> {
    Ok(Json(skills::popular_community().await?))
}

async fn community_install(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<InstallCommunityRequest>,
) -> Result<Json<String>, ApiError> {
    Ok(Json(
        skills::install_community(&st.engine.events, req).await?,
    ))
}

async fn repo_list(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<RepoListRequest>,
) -> Result<Json<Vec<RepoSkill>>, ApiError> {
    Ok(Json(skills::list_from_repo(&req.source).await?))
}

async fn repo_install(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<InstallFromRepoRequest>,
) -> Result<Json<Vec<String>>, ApiError> {
    Ok(Json(
        skills::install_from_repo(&st.engine.events, req).await?,
    ))
}
