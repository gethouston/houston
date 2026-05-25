//! Workspace-scoped user identity credential routes.
//!
//! One Beltic `user` credential per Houston user (per OS user), stored at
//! `<home>/.houston/identity/identity.json` via
//! `houston_engine_core::credentials::identity`. The Beltic Issuer +
//! Verifier come from [`super::beltic_shared`] (lazy env-driven).
//!
//! Routes:
//!   GET  /v1/identity            — return current identity credential or null
//!   POST /v1/identity            — issue via Beltic + persist + emit event
//!   POST /v1/identity/revoke     — revoke via Beltic + update status + emit

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use houston_engine_core::credentials::{
    evidence_store, identity, CredentialStatus, NewCredential, VerifiableCredential,
};
use houston_engine_core::CoreError;
use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};

use super::beltic_shared::{ctx as beltic_ctx, map_beltic};
use super::error::ApiError;
use crate::state::ServerState;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/identity", get(get_identity).post(issue_identity))
        .route("/identity/revoke", post(revoke_identity))
        .route("/identity/evidence", post(persist_evidence))
}

#[derive(Debug, Clone, Deserialize)]
struct PersistEvidenceQuery {
    sha256: String,
    content_type: String,
}

#[derive(Debug, Clone, Serialize)]
struct PersistEvidenceResponse {
    stored_at: String,
    sha256: String,
    size_bytes: usize,
}

/// Persist a piece of attached evidence to
/// `<home>/.houston/identity/evidence/<sha256>.<ext>` (mode 0600).
///
/// The renderer has already hashed the file bytes; we re-hash on the
/// server side and reject if the body doesn't match the supplied
/// `sha256` query param. That gives the engine its own end-to-end
/// integrity check and prevents a buggy renderer from saving the wrong
/// bytes against a "trusted" content address.
async fn persist_evidence(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<PersistEvidenceQuery>,
    body: Bytes,
) -> Result<(StatusCode, Json<PersistEvidenceResponse>), ApiError> {
    if body.is_empty() {
        return Err(ApiError(CoreError::BadRequest(
            "request body must contain evidence bytes".into(),
        )));
    }

    let supplied = q.sha256.to_ascii_lowercase();
    let actual = sha256_hex(&body);
    if actual != supplied {
        return Err(ApiError(CoreError::BadRequest(format!(
            "sha256 mismatch: body hashes to {actual} but query param said {supplied}",
        ))));
    }

    let root = st.engine.paths.home().to_path_buf();
    let path = evidence_store::save(&root, &actual, &q.content_type, &body)?;

    Ok((
        StatusCode::CREATED,
        Json(PersistEvidenceResponse {
            stored_at: path.to_string_lossy().to_string(),
            sha256: actual,
            size_bytes: body.len(),
        }),
    ))
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    out.iter().map(|b| format!("{b:02x}")).collect()
}

/// What the verify modal sends. Houston's route constructs the full
/// Beltic IssueRequest from these fields — UI doesn't need to know the
/// subject/claims schema.
#[derive(Debug, Clone, Deserialize)]
struct IssueIdentityRequest {
    pub nationality: Option<String>,
    pub date_of_birth: Option<String>,
    pub id_document_type: Option<String>,
    pub id_document_country: Option<String>,
    #[serde(default)]
    pub self_attestation_complete: bool,
    /// Opaque evidence refs supplied by the UI. Today the UI emits
    /// `sha256:<hex>:<doctype>:<urlencoded-filename>` strings — Beltic
    /// stores them verbatim. When the Beltic `/v1/evidence` endpoint
    /// ships, the format will switch to `evidence:<id>`.
    #[serde(default)]
    pub evidence_refs: Vec<String>,
}

async fn get_identity(
    State(st): State<Arc<ServerState>>,
) -> Result<Json<Option<VerifiableCredential>>, ApiError> {
    let root = st.engine.paths.home().to_path_buf();
    Ok(Json(identity::active(&root)?))
}

async fn issue_identity(
    State(st): State<Arc<ServerState>>,
    Json(input): Json<IssueIdentityRequest>,
) -> Result<(StatusCode, Json<VerifiableCredential>), ApiError> {
    if !input.self_attestation_complete {
        return Err(ApiError(CoreError::BadRequest(
            "self_attestation_complete must be true".into(),
        )));
    }
    if input.id_document_type.is_some() && input.id_document_country.is_none() {
        return Err(ApiError(CoreError::BadRequest(
            "id_document_country is required when id_document_type is set".into(),
        )));
    }

    let user_id = std::env::var("HOUSTON_APP_USER_ID").unwrap_or_else(|_| "local".into());
    let subject_id = format!("usr_{user_id}");
    let trust_level = if input.id_document_type.is_some() {
        "idv_verified"
    } else {
        "self_attested"
    };

    let mut claims = serde_json::json!({
        "kyc_status": "approved",
        "trust_level": trust_level,
    });
    if let Some(n) = &input.nationality {
        claims["nationality"] = serde_json::Value::String(n.clone());
    }
    if let Some(d) = &input.date_of_birth {
        claims["date_of_birth"] = serde_json::Value::String(d.clone());
    }
    if let Some(t) = &input.id_document_type {
        claims["id_document_type"] = serde_json::Value::String(t.clone());
    }
    if let Some(c) = &input.id_document_country {
        claims["id_document_country"] = serde_json::Value::String(c.clone());
    }

    let issue_req = houston_beltic::issuer::IssueRequest {
        credential_type: "user".into(),
        self_attestation_complete: true,
        subject: serde_json::json!({"type": "person", "id": subject_id}),
        claims,
        evidence_refs: input.evidence_refs.clone(),
        ttl: Some("P1Y".into()),
    };

    let beltic = beltic_ctx()?;
    let issued = beltic.issuer.issue(issue_req).await.map_err(map_beltic)?;

    let root = st.engine.paths.home().to_path_buf();
    let row = identity::save(
        &root,
        NewCredential {
            credential_id: issued.credential_id.clone(),
            credential_type: issued.credential_type,
            subject_type: "person".into(),
            subject_id: issued
                .subject
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            issuer_did: issued.issuer_did,
            kid: issued.kid,
            alg: issued.alg,
            signed_payload: issued.signed_payload,
            claims: issued.claims,
            issued_at: issued.issued_at,
            expires_at: issued.expires_at,
            delegated_by_subject_id: None,
            status_list_index: issued.status_list_index,
        },
    )?;

    st.engine.events.emit(HoustonEvent::CredentialIssued {
        agent_path: format!("identity:{}", row.subject_id),
        credential_id: row.credential_id.clone(),
    });
    Ok((StatusCode::CREATED, Json(row)))
}

async fn revoke_identity(
    State(st): State<Arc<ServerState>>,
) -> Result<Json<Option<VerifiableCredential>>, ApiError> {
    let root = st.engine.paths.home().to_path_buf();
    let current = identity::active(&root)?;
    let Some(cred) = current else {
        return Ok(Json(None));
    };

    let beltic = beltic_ctx()?;
    let revoked = beltic
        .issuer
        .revoke(&cred.credential_id, Some("revoked_by_user"))
        .await
        .map_err(map_beltic)?;
    let row = identity::update_status(
        &root,
        &cred.credential_id,
        CredentialStatus::Revoked,
        revoked.revoked_at,
        revoked.revocation_reason,
    )?;
    st.engine.events.emit(HoustonEvent::CredentialRevoked {
        agent_path: format!("identity:{}", row.subject_id),
        credential_id: row.credential_id.clone(),
    });
    Ok(Json(Some(row)))
}
