//! `/v1/meetings` REST routes — meeting CRUD for a given agent.
//!
//! Agent path is passed as `?agentPath=` query param (same convention as
//! routines). Mutating routes emit `MeetingChanged` / `MeetingStatusChanged`
//! on the broadcast bus so the frontend can invalidate its query cache.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use houston_engine_core::{
    agents::meetings::{self, CaptionLine, Meeting, MeetingUpdate, NewMeeting},
    CoreError,
};
use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Deserialize)]
struct AgentQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
}

#[derive(Deserialize)]
struct CreateBody {
    #[serde(rename = "agentPath")]
    agent_path: String,
    #[serde(flatten)]
    meeting: NewMeeting,
}

#[derive(Deserialize)]
struct UpdateBody {
    #[serde(rename = "agentPath")]
    agent_path: String,
    #[serde(flatten)]
    updates: MeetingUpdate,
}

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/meetings", get(list).post(create))
        .route("/meetings/:id", patch(update).delete(remove))
        .route("/meetings/:id/captions", post(push_captions))
        .route("/meetings/:id/start", post(start))
        .route("/meetings/:id/end", post(end))
        .route("/meetings/:id/respond", post(respond))
}

fn agent_root(p: &str) -> PathBuf {
    PathBuf::from(p)
}

fn emit(state: &ServerState, event: HoustonEvent) {
    state.engine.events.emit(event);
}

async fn list(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Vec<Meeting>>, ApiError> {
    Ok(Json(meetings::list(&agent_root(&q.agent_path))?))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Json(body): Json<CreateBody>,
) -> Result<(StatusCode, Json<Meeting>), ApiError> {
    let root = agent_root(&body.agent_path);
    let meeting = meetings::create(&root, body.meeting)?;
    emit(
        &st,
        HoustonEvent::MeetingChanged {
            agent_path: body.agent_path.clone(),
            meeting_id: meeting.id.clone(),
        },
    );
    Ok((StatusCode::CREATED, Json(meeting)))
}

async fn update(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateBody>,
) -> Result<Json<Meeting>, ApiError> {
    let root = agent_root(&body.agent_path);
    let meeting = meetings::update(&root, &id, body.updates)?;
    let status_str = meeting.status.to_string();
    emit(
        &st,
        HoustonEvent::MeetingChanged {
            agent_path: body.agent_path.clone(),
            meeting_id: meeting.id.clone(),
        },
    );
    emit(
        &st,
        HoustonEvent::MeetingStatusChanged {
            agent_path: body.agent_path.clone(),
            meeting_id: meeting.id.clone(),
            status: status_str,
        },
    );
    Ok(Json(meeting))
}

async fn remove(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<(), ApiError> {
    let root = agent_root(&q.agent_path);
    meetings::delete(&root, &id)?;
    emit(
        &st,
        HoustonEvent::MeetingChanged {
            agent_path: q.agent_path.clone(),
            meeting_id: id,
        },
    );
    Ok(())
}

#[derive(Deserialize)]
struct CaptionsBody {
    #[serde(rename = "agentPath")]
    agent_path: String,
    captions: Vec<CaptionLine>,
}

async fn push_captions(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<CaptionsBody>,
) -> Result<Json<Meeting>, ApiError> {
    let root = agent_root(&body.agent_path);
    let meeting = meetings::push_captions(&root, &id, &body.captions)?;
    emit(
        &st,
        HoustonEvent::MeetingChanged {
            agent_path: body.agent_path,
            meeting_id: id,
        },
    );
    Ok(Json(meeting))
}

async fn start(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Meeting>, ApiError> {
    let agent_path = body["agentPath"]
        .as_str()
        .ok_or_else(|| ApiError(CoreError::BadRequest("agentPath required".into())))?
        .to_string();
    let root = agent_root(&agent_path);
    let meeting = meetings::start_meeting(&root, &id)?;
    emit(
        &st,
        HoustonEvent::MeetingStatusChanged {
            agent_path: agent_path.clone(),
            meeting_id: id.clone(),
            status: meeting.status.to_string(),
        },
    );
    emit(&st, HoustonEvent::MeetingChanged { agent_path, meeting_id: id });
    Ok(Json(meeting))
}

async fn end(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Meeting>, ApiError> {
    let agent_path = body["agentPath"]
        .as_str()
        .ok_or_else(|| ApiError(CoreError::BadRequest("agentPath required".into())))?
        .to_string();
    let root = agent_root(&agent_path);
    let meeting = meetings::end_meeting(&root, &id)?;
    emit(
        &st,
        HoustonEvent::MeetingStatusChanged {
            agent_path: agent_path.clone(),
            meeting_id: id.clone(),
            status: meeting.status.to_string(),
        },
    );
    emit(&st, HoustonEvent::MeetingChanged { agent_path: agent_path.clone(), meeting_id: id });

    // Spawn post-processing in the background so the HTTP response returns immediately.
    let events = st.engine.events.clone();
    let meeting_clone = meeting.clone();
    tokio::spawn(meetings::post_process_meeting(
        root,
        agent_path,
        meeting_clone,
        events,
    ));

    Ok(Json(meeting))
}

#[derive(Deserialize)]
struct RespondBody {
    #[serde(rename = "agentPath")]
    agent_path: String,
    question: String,
    #[serde(default, rename = "recentTranscript")]
    recent_transcript: String,
}

#[derive(Serialize)]
struct RespondResponse {
    response: String,
}

/// `POST /v1/meetings/:id/respond` — agent generates a live in-meeting reply.
///
/// Called by the captions bridge when a participant addresses the bot by name.
/// Awaits the agent session (blocking the HTTP request) so the bridge gets the
/// response text in the same fetch call — no polling required.
async fn respond(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<RespondBody>,
) -> Result<Json<RespondResponse>, ApiError> {
    let root = agent_root(&body.agent_path);
    let meeting = meetings::get(&root, &id)?;
    let events = st.engine.events.clone();
    let response = meetings::respond_in_meeting(
        root,
        body.agent_path,
        meeting,
        body.question,
        body.recent_transcript,
        events,
    )
    .await?;
    Ok(Json(RespondResponse { response }))
}
