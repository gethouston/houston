//! Cross-session timeline aggregation — Phase 4 of RFC #248 /
//! `advanced.timeline`.
//!
//! Reads `chat_feed` rows across a caller-supplied list of session ids
//! (the frontend derives the list from the agent's
//! `.houston/activity/activity.json`) and returns them ordered newest
//! first, bounded by a hard cap. The engine doesn't try to know what
//! sessions belong to which agent — that mapping lives upstream of this
//! module.
//!
//! Enforcement surface: routes always on. UI gating happens via
//! `advanced.timeline` in `app/src/components/shell/workspace-shell.tsx`.

use crate::error::{CoreError, CoreResult};
use crate::state::EngineState;
use serde::{Deserialize, Serialize};

const DEFAULT_LIMIT: u32 = 200;
const MAX_LIMIT: u32 = 2000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRequest {
    /// Session ids the caller wants events for. Empty → empty response.
    pub session_ids: Vec<String>,
    /// Optional cap on rows returned. Default 200, hard max 2000.
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub claude_session_id: String,
    pub timestamp: String,
    pub feed_type: String,
    /// Raw `data_json` from the chat_feed row. Frontend interprets per
    /// `feed_type` (matches the same TS discriminated union it already
    /// renders in `<ChatPanel />`).
    pub data_json: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineResponse {
    pub events: Vec<TimelineEvent>,
    /// Echoed back so the UI knows whether it hit the cap.
    pub limit: u32,
}

pub async fn timeline(state: &EngineState, req: TimelineRequest) -> CoreResult<TimelineResponse> {
    let limit = req.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
    let rows = state
        .db
        .list_chat_feed_by_sessions(&req.session_ids, limit)
        .await
        .map_err(|e| CoreError::Internal(format!("list_chat_feed_by_sessions: {e}")))?;
    let events = rows
        .into_iter()
        .map(|r| TimelineEvent {
            claude_session_id: r.claude_session_id,
            timestamp: r.timestamp,
            feed_type: r.feed_type,
            data_json: r.data_json,
            source: r.source,
        })
        .collect();
    Ok(TimelineResponse { events, limit })
}
