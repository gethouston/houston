//! Beltic verifiable-credentials routes.
//!
//! Agent-scoped CRUD over `.houston/credentials/` plus a thin wrapper
//! around `houston_beltic::Issuer`. Handlers persist via
//! `houston_engine_core::credentials::store` and emit
//! `HoustonEvent::Credential*` so the UI invalidates its query keys.
//!
//! Beltic client init + error mapping live in [`super::beltic_shared`].

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use houston_beltic::issuer::IssueRequest;
use houston_engine_core::credentials::{
    self, CredentialStatus, NewCredential, VerifiableCredential,
};
use houston_engine_core::CoreError;
use houston_ui_events::HoustonEvent;
use serde::Deserialize;

use super::beltic_shared::{ctx as beltic_ctx, map_beltic};
use super::error::ApiError;
use crate::state::ServerState;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route(
            "/agents/credentials",
            get(list_credentials).post(issue_credential),
        )
        .route(
            "/agents/credentials/:credential_id/revoke",
            post(revoke_credential),
        )
        .route(
            "/agents/credentials/:credential_id/verify",
            post(verify_credential),
        )
}

#[derive(Deserialize)]
struct AgentQuery {
    agent_path: String,
}

#[derive(Deserialize)]
struct VerifyRequest {
    /// Transaction context to evaluate against `claims.permissions[]`.
    /// E.g. `{"resource_type":"wallet","action":"checkout","transaction_amount":5000}`.
    #[serde(default)]
    context: serde_json::Value,
}

async fn list_credentials(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<Vec<VerifiableCredential>>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    Ok(Json(credentials::list(&root)?))
}

async fn issue_credential(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentQuery>,
    Json(input): Json<IssueRequest>,
) -> Result<(StatusCode, Json<VerifiableCredential>), ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let beltic = beltic_ctx()?;
    let credential_type = input.credential_type.clone();
    let issued = beltic.issuer.issue(input).await.map_err(map_beltic)?;

    let row = credentials::save(
        &root,
        NewCredential {
            credential_id: issued.credential_id.clone(),
            credential_type,
            subject_type: string_field(&issued.subject, "type"),
            subject_id: string_field(&issued.subject, "id"),
            issuer_did: issued.issuer_did,
            kid: issued.kid,
            alg: issued.alg,
            signed_payload: issued.signed_payload,
            claims: issued.claims.clone(),
            issued_at: issued.issued_at,
            expires_at: issued.expires_at,
            delegated_by_subject_id: issued
                .claims
                .get("delegated_by_subject_id")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            status_list_index: issued.status_list_index,
        },
    )?;

    st.engine.events.emit(HoustonEvent::CredentialIssued {
        agent_path: q.agent_path.clone(),
        credential_id: row.credential_id.clone(),
    });
    Ok((StatusCode::CREATED, Json(row)))
}

async fn revoke_credential(
    State(st): State<Arc<ServerState>>,
    Path(credential_id): Path<String>,
    Query(q): Query<AgentQuery>,
) -> Result<Json<VerifiableCredential>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let beltic = beltic_ctx()?;
    let revoked = beltic
        .issuer
        .revoke(&credential_id, Some("revoked_by_user"))
        .await
        .map_err(map_beltic)?;

    let row = credentials::update_status(
        &root,
        &credential_id,
        CredentialStatus::Revoked,
        revoked.revoked_at,
        revoked.revocation_reason,
    )?;

    st.engine.events.emit(HoustonEvent::CredentialRevoked {
        agent_path: q.agent_path.clone(),
        credential_id: row.credential_id.clone(),
    });
    Ok(Json(row))
}

async fn verify_credential(
    State(_st): State<Arc<ServerState>>,
    Path(credential_id): Path<String>,
    Query(q): Query<AgentQuery>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<houston_beltic::VerifyResult>, ApiError> {
    let root = resolve_root(&q.agent_path)?;
    let cred = credentials::find_by_credential_id(&root, &credential_id)?
        .ok_or_else(|| CoreError::NotFound(format!("credential {credential_id}")))?;
    let beltic = beltic_ctx()?;
    let result = beltic
        .verifier
        .verify(&cred.signed_payload, &req.context)
        .await
        .map_err(map_beltic)?;
    Ok(Json(result))
}

fn string_field(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn resolve_root(agent_path: &str) -> Result<PathBuf, CoreError> {
    if agent_path.trim().is_empty() {
        return Err(CoreError::BadRequest("agent_path is required".into()));
    }
    Ok(expand_tilde(std::path::Path::new(agent_path)))
}

fn expand_tilde(p: &std::path::Path) -> PathBuf {
    if let Ok(stripped) = p.strip_prefix("~") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    p.to_path_buf()
}
