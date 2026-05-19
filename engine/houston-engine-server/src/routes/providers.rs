//! `/v1/providers/:name/{status,login,logout}` REST routes.
//!
//! The `default_provider` preference is exposed through the generic
//! `/v1/preferences/:key` endpoint, not here.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::provider::{self, ProviderStatus};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/providers/:name/status", get(status))
        // POST /providers/:name/login covers Gemini too. Under the hood,
        // `launch_login` detects `provider.id() == "gemini"` and drives
        // gemini-cli's own OAuth via the ACP `authenticate` JSON-RPC
        // method — gemini-cli opens the user's browser with its own
        // Google app identity ("Gemini CLI" on the consent screen) and
        // writes `~/.gemini/oauth_creds.json` itself. Same pattern as
        // `claude auth login --claudeai` and `codex login` for the
        // other providers.
        .route("/providers/:name/login", post(login))
        .route("/providers/:name/logout", post(logout))
        // Gemini-only: persist an API key the user pasted in the picker
        // dialog to `~/.gemini/.env`. Alternative to the OAuth flow for
        // users who'd rather pay-as-you-go via aistudio.google.com.
        .route(
            "/providers/gemini/credentials",
            post(gemini_set_credentials),
        )
}

async fn status(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<Json<ProviderStatus>, ApiError> {
    let p = provider::parse(&name)?;
    Ok(Json(provider::check_status(p).await?))
}

async fn login(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<(), ApiError> {
    let p = provider::parse(&name)?;
    provider::launch_login(p).await?;
    Ok(())
}

async fn logout(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<(), ApiError> {
    let p = provider::parse(&name)?;
    provider::launch_logout(p).await?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCredentials {
    /// Raw API key the user pasted in the dialog. Validated + persisted
    /// by `houston_engine_core::provider::set_gemini_api_key`. NEVER
    /// logged in plaintext.
    api_key: String,
}

async fn gemini_set_credentials(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<GeminiCredentials>,
) -> Result<(), ApiError> {
    provider::set_gemini_api_key(&body.api_key).await?;
    Ok(())
}

