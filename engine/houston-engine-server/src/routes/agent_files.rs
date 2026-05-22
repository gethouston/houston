//! `/v1/agents/files/*` REST routes — generic file I/O for an agent directory.
//!
//! Two flavours:
//!  * Agent-data files (`/v1/agents/files`): read/write/seed/migrate the typed
//!    `.houston/<type>/<type>.json` layout. Writes auto-emit the matching
//!    `HoustonEvent`.
//!  * User-facing project files (`/v1/agents/files/list`, `/import`, …):
//!    powers the file browser. Mutations emit `FilesChanged`.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use base64::Engine as _;
use houston_engine_core::agents::files;
use houston_engine_core::paths::expand_tilde;
use houston_engine_core::CoreError;
use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/agents/files", get(list_project_files).delete(delete_file))
        .route("/agents/files/read", post(read))
        .route("/agents/files/write", post(write))
        .route("/agents/files/seed-schemas", post(seed_schemas))
        .route("/agents/files/migrate", post(migrate))
        .route("/agents/files/read-project", post(read_project))
        .route("/agents/files/rename", post(rename))
        .route("/agents/files/folder", post(create_folder))
        .route("/agents/files/import", post(import))
        .route("/agents/files/import-bytes", post(import_bytes))
}

// ---------------------------------------------------------------------------
// Common request shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AgentPathBody {
    pub agent_path: String,
}

#[derive(Deserialize)]
pub struct AgentRelBody {
    pub agent_path: String,
    pub rel_path: String,
}

#[derive(Deserialize)]
pub struct WriteBody {
    pub agent_path: String,
    pub rel_path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub agent_path: String,
    pub rel_path: String,
    pub new_name: String,
}

#[derive(Deserialize)]
pub struct CreateFolderBody {
    pub agent_path: String,
    pub folder_name: String,
}

#[derive(Deserialize)]
pub struct ImportBody {
    pub agent_path: String,
    pub file_paths: Vec<String>,
    #[serde(default)]
    pub target_folder: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportBytesBody {
    pub agent_path: String,
    pub file_name: String,
    pub data_base64: String,
}

#[derive(Deserialize)]
pub struct DeleteFileQuery {
    pub agent_path: String,
    pub rel_path: String,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
}

#[derive(Serialize)]
pub struct CreatedFolder {
    pub created: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Agent-data files
// ---------------------------------------------------------------------------

async fn read(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<AgentRelBody>,
) -> Result<Json<FileContent>, ApiError> {
    let root = resolve_root(&body.agent_path)?;
    let content = files::read_agent_file(&root, &body.rel_path)?;
    Ok(Json(FileContent { content }))
}

async fn write(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<WriteBody>,
) -> Result<(), ApiError> {
    let root = resolve_root(&body.agent_path)?;
    if let Some(event) =
        files::write_agent_file(&root, &body.agent_path, &body.rel_path, &body.content)?
    {
        emit(&st, event);
    }
    Ok(())
}

async fn seed_schemas(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<AgentPathBody>,
) -> Result<(), ApiError> {
    let root = resolve_root(&body.agent_path)?;
    files::seed_agent_schemas(&root)?;
    Ok(())
}

async fn migrate(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<AgentPathBody>,
) -> Result<(), ApiError> {
    let root = resolve_root(&body.agent_path)?;
    files::migrate_agent_files(&root)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// User-facing project files
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AgentPathQuery {
    pub agent_path: String,
}

async fn list_project_files(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentPathQuery>,
) -> Result<Json<Vec<files::ProjectFile>>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(files::list_project_files(&root)?))
}

async fn read_project(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<AgentRelBody>,
) -> Result<Json<FileContent>, ApiError> {
    let root = resolve_root(&body.agent_path)?;
    let content = files::read_project_file(&root, &body.rel_path)?;
    Ok(Json(FileContent { content }))
}

async fn rename(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<RenameBody>,
) -> Result<(), ApiError> {
    let root = resolve_root(&body.agent_path)?;
    files::rename_file(&root, &body.rel_path, &body.new_name)?;
    emit(
        &st,
        HoustonEvent::FilesChanged {
            agent_path: body.agent_path,
        },
    );
    Ok(())
}

async fn delete_file(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<DeleteFileQuery>,
) -> Result<(), ApiError> {
    let root = resolve_root(&q.agent_path)?;
    files::delete_file(&root, &q.rel_path)?;
    emit(
        &st,
        HoustonEvent::FilesChanged {
            agent_path: q.agent_path,
        },
    );
    Ok(())
}

async fn create_folder(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<CreateFolderBody>,
) -> Result<Json<CreatedFolder>, ApiError> {
    let root = resolve_root(&body.agent_path)?;
    let created = files::create_folder(&root, &body.folder_name)?;
    emit(
        &st,
        HoustonEvent::FilesChanged {
            agent_path: body.agent_path,
        },
    );
    Ok(Json(CreatedFolder { created }))
}

async fn import(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<ImportBody>,
) -> Result<Json<Vec<files::ProjectFile>>, ApiError> {
    let root = resolve_root(&body.agent_path)?;
    let imported = files::import_files(&root, &body.file_paths, body.target_folder.as_deref())?;
    if !imported.is_empty() {
        emit(
            &st,
            HoustonEvent::FilesChanged {
                agent_path: body.agent_path,
            },
        );
    }
    Ok(Json(imported))
}

async fn import_bytes(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<ImportBytesBody>,
) -> Result<Json<files::ProjectFile>, ApiError> {
    let root = resolve_root(&body.agent_path)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&body.data_base64)
        .map_err(|e| CoreError::BadRequest(format!("invalid base64: {e}")))?;
    let pf = files::write_file_bytes(&root, &body.file_name, &bytes)?;
    emit(
        &st,
        HoustonEvent::FilesChanged {
            agent_path: body.agent_path,
        },
    );
    Ok(Json(pf))
}
