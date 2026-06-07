//! `/v1/providers/:name/{status,login,logout}` REST routes.
//!
//! The `default_provider` preference is exposed through the generic
//! `/v1/preferences/:key` endpoint, not here.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::provider::{
    self, CredentialExportRequest, CredentialExportResponse, CredentialImportRequest,
    CredentialImportResponse, CredentialImportSessionResponse, ProviderStatus,
};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        // Static OpenRouter routes before `/providers/:name/*` param routes.
        .route(
            "/providers/openrouter/credentials",
            post(openrouter_set_credentials),
        )
        .route(
            "/providers/openrouter/models",
            get(openrouter_list_models),
        )
        .route("/providers/:name/status", get(status))
        // Claude and Codex use their CLI login subcommands here.
        //
        // `?deviceAuth=true` requests the provider's headless device-code
        // flow (OpenAI/codex `--device-auth`). Remote clients (webapp,
        // mobile) set it because the CLI's `localhost` OAuth callback can't
        // reach a browser on another machine; desktop omits it and keeps the
        // browser-loopback login.
        .route("/providers/:name/login", post(login))
        // POST /providers/:name/login/code submits the OAuth
        // verification code the user pasted from their browser.
        // Required for remote/headless engines (container, Always-On)
        // where the CLI can't open the user's browser itself; the
        // engine then surfaces the sign-in URL via the WebSocket
        // `ProviderLoginUrl` event, the UI shows it + a paste-code
        // input, and the submitted code is written back to the CLI's
        // stdin so it can exchange for an OAuth token.
        .route("/providers/:name/login/code", post(login_code))
        // POST /providers/:name/login/cancel aborts an in-flight
        // browser sign-in. Without it, a user who closes the OAuth tab
        // before finishing is stuck: the CLI keeps its localhost
        // callback open, so the engine only gives up after the 10-min
        // relay timeout, and a fresh Connect click is rejected as
        // "already pending" until then. Cancel kills the subprocess and
        // frees the slot so the user can retry immediately (#237).
        .route("/providers/:name/login/cancel", post(login_cancel))
        .route("/providers/:name/logout", post(logout))
        // Anthropic-only: persist an API key the user pasted in the picker
        // dialog to `~/.houston/anthropic/.env`. Houston injects
        // `ANTHROPIC_API_KEY` into Claude Code subprocesses at spawn time.
        .route(
            "/providers/anthropic/credentials",
            post(anthropic_set_credentials),
        )
        // OpenAI-only: persist an API key to `~/.houston/openai/.env`.
        // Houston injects `OPENAI_API_KEY` when no OAuth session exists.
        .route(
            "/providers/openai/credentials",
            post(openai_set_credentials),
        )
        .route(
            "/providers/:name/credential-import/session",
            post(credential_import_session),
        )
        .route(
            "/providers/:name/credential-export",
            post(credential_export),
        )
        .route(
            "/providers/:name/credential-import",
            post(credential_import),
        )
}

async fn status(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<Json<ProviderStatus>, ApiError> {
    let p = provider::parse(&name)?;
    Ok(Json(provider::check_status(p).await?))
}

/// Optional query for [`login`]. `?deviceAuth=true` requests the
/// provider's headless device-code flow (OpenAI/codex). Remote clients
/// (webapp, mobile) set it because they can't receive the CLI's
/// `localhost` OAuth callback. Absent (desktop, older clients) keeps the
/// default browser-loopback login. Ignored by providers without a device
/// flow.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginQuery {
    #[serde(default)]
    device_auth: bool,
}

async fn login(
    State(st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Query(q): Query<LoginQuery>,
) -> Result<(), ApiError> {
    let p = provider::parse(&name)?;
    provider::launch_login(p, st.engine.events.clone(), q.device_auth).await?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct LoginCode {
    /// Verification code the user pasted from the OAuth callback page.
    code: String,
}

async fn login_code(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Json(body): Json<LoginCode>,
) -> Result<(), ApiError> {
    let p = provider::parse(&name)?;
    provider::submit_login_code(p, &body.code).await?;
    Ok(())
}

async fn login_cancel(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<(), ApiError> {
    let p = provider::parse(&name)?;
    provider::cancel_login(p).await?;
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
struct OpenRouterCredentials {
    /// Raw API key the user pasted in the dialog. Validated + persisted
    /// by `houston_engine_core::provider::set_openrouter_api_key`. NEVER
    /// logged in plaintext.
    api_key: String,
}

async fn openrouter_set_credentials(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<OpenRouterCredentials>,
) -> Result<(), ApiError> {
    provider::set_openrouter_api_key(&body.api_key).await?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenRouterModelsQuery {
    #[serde(default)]
    q: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenRouterModelsResponse {
    models: Vec<provider::OpenRouterCatalogModel>,
}

async fn openrouter_list_models(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<OpenRouterModelsQuery>,
) -> Result<Json<OpenRouterModelsResponse>, ApiError> {
    let models = provider::list_openrouter_models(q.q.as_deref()).await?;
    Ok(Json(OpenRouterModelsResponse { models }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiCredentials {
    /// Raw API key the user pasted in the dialog. Validated + persisted
    /// by `houston_engine_core::provider::set_openai_api_key`. NEVER
    /// logged in plaintext.
    api_key: String,
}

async fn openai_set_credentials(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<OpenAiCredentials>,
) -> Result<(), ApiError> {
    provider::set_openai_api_key(&body.api_key).await?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnthropicCredentials {
    /// Raw API key the user pasted in the dialog. Validated + persisted
    /// by `houston_engine_core::provider::set_anthropic_api_key`. NEVER
    /// logged in plaintext.
    api_key: String,
}

async fn anthropic_set_credentials(
    State(_st): State<Arc<ServerState>>,
    Json(body): Json<AnthropicCredentials>,
) -> Result<(), ApiError> {
    provider::set_anthropic_api_key(&body.api_key).await?;
    Ok(())
}

async fn credential_import_session(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
) -> Result<Json<CredentialImportSessionResponse>, ApiError> {
    Ok(Json(provider::start_import_session(&name)?))
}

async fn credential_export(
    State(_st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Json(body): Json<CredentialExportRequest>,
) -> Result<Json<CredentialExportResponse>, ApiError> {
    Ok(Json(provider::export_credentials(&name, &body).await?))
}

async fn credential_import(
    State(st): State<Arc<ServerState>>,
    Path(name): Path<String>,
    Json(body): Json<CredentialImportRequest>,
) -> Result<Json<CredentialImportResponse>, ApiError> {
    Ok(Json(
        provider::import_credentials(&name, &body, st.engine.events.clone()).await?,
    ))
}

