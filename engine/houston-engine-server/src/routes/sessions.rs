//! `/v1/agents/{agent_path}/sessions` — session lifecycle routes.
//!
//! - `POST /v1/agents/{agent_path}/sessions` — start a new session turn.
//! - `POST /v1/agents/{agent_path}/sessions/{key}:cancel` — SIGTERM the
//!   running CLI for that session_key.
//!
//! `agent_path` is a single path segment and MUST be percent-encoded by the
//! caller if it contains slashes (normal for absolute paths like
//! `/Users/x/Documents/Houston/ws/agent` → `%2FUsers%2Fx%2F…`).
//!
//! Sessions stream updates over the WebSocket on the `session:{key}` topic.
//! Clients are responsible for subscribing to the topic BEFORE calling this
//! route (race-free: the forwarder drops events that arrive before
//! subscription, which is safe because the caller already has the
//! session_key echoed back from this response).

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use houston_composio::toolkit_display_name;
use houston_engine_core::sessions::{
    self, generate_instructions, history, resolve_agent_dir, resolve_provider, summarize,
    SessionRuntime, StartParams,
};
use houston_engine_core::CoreError;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route(
            "/agents/:agent_path/sessions",
            post(start_session),
        )
        .route(
            "/agents/:agent_path/sessions/onboarding",
            post(start_onboarding),
        )
        .route(
            "/agents/:agent_path/sessions/:key_action",
            post(cancel_session),
        )
        .route(
            "/agents/:agent_path/sessions/:key/history",
            get(load_history),
        )
        .route(
            "/agents/:agent_path/sessions/:key/user_input",
            post(submit_user_input),
        )
        .route("/sessions/summarize", post(summarize_activity))
        .route(
            "/sessions/generate-instructions",
            post(generate_agent_instructions),
        )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    /// Stable conversation slot id. Required — the frontend owns this.
    pub session_key: String,
    pub prompt: String,
    /// Optional pre-built system prompt. Caller (Tauri adapter today) assembles
    /// CLAUDE.md + seed + integration guidance and passes the final string.
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    /// Working-directory override. Defaults to `agent_dir`.
    #[serde(default)]
    pub working_dir: Option<String>,
    /// Provider override (`"anthropic"` or `"openai"`). Wins over the
    /// agent/workspace-resolved provider.
    #[serde(default)]
    pub provider: Option<String>,
    /// Model override. Wins over any resolved default.
    #[serde(default)]
    pub model: Option<String>,
    /// Reasoning effort override. Forwarded to the CLI as `--effort` (Claude)
    /// or `-c model_reasoning_effort=<value>` (Codex). Used by the onboarding
    /// tutorial to force a known-good value regardless of what the user has
    /// in `~/.codex/config.toml`.
    #[serde(default)]
    pub effort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResponse {
    pub session_key: String,
}

async fn start_session(
    State(st): State<Arc<ServerState>>,
    Path(agent_path): Path<String>,
    Json(req): Json<StartRequest>,
) -> Result<Json<StartResponse>, ApiError> {
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    let working_dir = req
        .working_dir
        .as_deref()
        .map(|p| sessions::expand_tilde(std::path::Path::new(p)))
        .unwrap_or_else(|| agent_dir.clone());

    // Override > agent config > Anthropic default.
    let ResolvedProviderChoice { provider, model } =
        resolve_provider_with_overrides(&agent_dir, req.provider.as_deref(), req.model.clone())?;

    let params = StartParams {
        agent_dir,
        working_dir,
        session_key: req.session_key.clone(),
        prompt: req.prompt,
        system_prompt: req.system_prompt,
        source: req.source,
        provider,
        model,
        effort: req.effort,
    };

    let rt = SessionRuntime::clone(&st.engine.sessions);
    let sink = st.engine.events.clone();
    let db = st.engine.db.clone();
    let key = sessions::start(
        &rt,
        sink,
        db,
        &st.engine.app_system_prompt,
        &st.engine.paths,
        params,
    )
    .await?;

    Ok(Json(StartResponse { session_key: key }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelResponse {
    pub cancelled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingRequest {
    pub session_key: String,
}

async fn start_onboarding(
    State(st): State<Arc<ServerState>>,
    Path(agent_path): Path<String>,
    Json(req): Json<OnboardingRequest>,
) -> Result<Json<StartResponse>, ApiError> {
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    let rt = SessionRuntime::clone(&st.engine.sessions);
    let sink = st.engine.events.clone();
    let db = st.engine.db.clone();
    let key = sessions::start_onboarding(
        &rt,
        sink,
        db,
        &st.engine.app_system_prompt,
        &st.engine.app_onboarding_prompt,
        &st.engine.paths,
        agent_dir,
        req.session_key,
    )
    .await?;
    Ok(Json(StartResponse { session_key: key }))
}

async fn load_history(
    State(st): State<Arc<ServerState>>,
    Path((agent_path, key)): Path<(String, String)>,
) -> Result<Json<Vec<history::ChatHistoryEntry>>, ApiError> {
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    Ok(Json(history::load(&st.engine.db, &agent_dir, &key).await?))
}

/// POST `/v1/agents/:agent_path/sessions/:key/user_input` — frontend submits
/// the user's answer to a pending `mcp__houston__AskUserQuestion`. The MCP
/// handler in `routes/mcp.rs` is currently blocked awaiting this exact
/// `tool_use_id`; we resolve its oneshot and return 204.
///
/// Errors:
/// - `404 NOT_FOUND` if no pending question matches (already answered, wrong
///   id, session cancelled).
/// - `409 CONFLICT` if the MCP handler was cancelled in the same tick.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInputRequest {
    /// The Anthropic-emitted `tool_use_id` echoed back from the frontend's
    /// `FeedItem::ToolCall` row. The MCP handler is keyed on this id.
    pub tool_use_id: String,
    /// The structured answer payload, shape decided by the frontend.
    /// Typically `{ answers: [{ selected: string[], other?: string }] }`
    /// but treated opaquely here — handed verbatim to the MCP tool result.
    pub answer: serde_json::Value,
}

async fn submit_user_input(
    State(st): State<Arc<ServerState>>,
    Path((_agent_path, key)): Path<(String, String)>,
    Json(req): Json<UserInputRequest>,
) -> Result<axum::http::StatusCode, ApiError> {
    st.engine
        .sessions
        .ask_user
        .submit_answer(&key, &req.tool_use_id, req.answer)
        .await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeRequest {
    pub message: String,
    #[serde(default)]
    pub agent_path: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

async fn summarize_activity(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<SummarizeRequest>,
) -> Result<Json<summarize::SummarizeResult>, ApiError> {
    let (provider, model) = if let Some(p_str) = req.provider.as_deref() {
        let provider = p_str
            .parse()
            .map_err(|e: String| CoreError::BadRequest(e))?;
        (provider, req.model)
    } else if let Some(agent_path) = req.agent_path.as_deref() {
        let agent_dir = resolve_agent_dir(&st.engine.paths, agent_path);
        let resolved = resolve_provider(&agent_dir);
        (resolved.provider, req.model.or(resolved.model))
    } else {
        (Provider::default(), req.model)
    };
    Ok(Json(
        summarize::summarize(&req.message, provider, model.as_deref()).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInstructionsRequest {
    pub description: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestedIntegration {
    slug: String,
    display_name: String,
}

fn resolve_suggested_integration(raw: String) -> SuggestedIntegration {
    let slug = raw.to_lowercase();
    let display_name = toolkit_display_name(&slug).to_string();
    SuggestedIntegration { slug, display_name }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateInstructionsResponse {
    name: String,
    instructions: String,
    suggested_integrations: Vec<SuggestedIntegration>,
    // Passthrough: core already built + validated the cron, no resolution needed.
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_routine: Option<generate_instructions::SuggestedRoutine>,
}

async fn generate_agent_instructions(
    Json(req): Json<GenerateInstructionsRequest>,
) -> Result<Json<GenerateInstructionsResponse>, ApiError> {
    let (provider, model) = if let Some(p_str) = req.provider.as_deref() {
        let provider = p_str
            .parse()
            .map_err(|e: String| CoreError::BadRequest(e))?;
        (provider, req.model)
    } else {
        // `Provider::default()` is anthropic — same fallback the
        // `summarize_activity` handler above uses for the no-override case.
        (Provider::default(), req.model)
    };
    let result =
        generate_instructions::generate_instructions(&req.description, provider, model.as_deref())
            .await?;
    let suggested_integrations = result
        .suggested_integrations
        .into_iter()
        .map(resolve_suggested_integration)
        .collect();
    Ok(Json(GenerateInstructionsResponse {
        name: result.name,
        instructions: result.instructions,
        suggested_integrations,
        suggested_routine: result.suggested_routine,
    }))
}

async fn cancel_session(
    State(st): State<Arc<ServerState>>,
    Path((agent_path, key_action)): Path<(String, String)>,
) -> Result<Json<CancelResponse>, ApiError> {
    let session_key = match key_action.strip_suffix(":cancel") {
        Some(k) if !k.is_empty() => k.to_string(),
        _ => {
            return Err(CoreError::BadRequest(format!(
                "path action must be `:cancel`, got {key_action:?}"
            ))
            .into());
        }
    };
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    let agent_path_str = agent_dir.to_string_lossy().to_string();

    let cancelled = sessions::cancel(
        &st.engine.sessions,
        &st.engine.events,
        &agent_path_str,
        &session_key,
    )
    .await;
    Ok(Json(CancelResponse { cancelled }))
}

// ---------------------------------------------------------------------------

struct ResolvedProviderChoice {
    provider: Provider,
    model: Option<String>,
}

fn resolve_provider_with_overrides(
    agent_dir: &std::path::Path,
    provider_override: Option<&str>,
    model_override: Option<String>,
) -> Result<ResolvedProviderChoice, ApiError> {
    if let Some(p_str) = provider_override {
        let provider: Provider = p_str
            .parse()
            .map_err(|e: String| CoreError::BadRequest(e))?;
        return Ok(ResolvedProviderChoice {
            provider,
            model: model_override,
        });
    }
    let mut resolved = resolve_provider(agent_dir);
    if let Some(m) = model_override {
        resolved.model = Some(m);
    }
    Ok(ResolvedProviderChoice {
        provider: resolved.provider,
        model: resolved.model,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_normalizes_uppercase_slug() {
        let result = resolve_suggested_integration("GMAIL".to_string());
        assert_eq!(result.slug, "gmail");
        assert_eq!(result.display_name, "Gmail");
    }

    #[test]
    fn resolve_normalizes_mixed_case_slug() {
        let result = resolve_suggested_integration("GoogleCalendar".to_string());
        assert_eq!(result.slug, "googlecalendar");
        assert_eq!(result.display_name, "Google Calendar");
    }

    #[test]
    fn resolve_unknown_slug_uses_slug_as_display_name() {
        let result = resolve_suggested_integration("UNKNOWNTOOL".to_string());
        assert_eq!(result.slug, "unknowntool");
        assert_eq!(result.display_name, "unknowntool");
    }
}
