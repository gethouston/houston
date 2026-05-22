//! Webhook receiver for Beltic credential status events.
//!
//! Beltic POSTs to `/v1/webhooks/beltic` with the Stripe-pattern
//! `Beltic-Signature` + `Beltic-Timestamp` headers. We verify the HMAC
//! before parsing the body, look up the credential locally (the webhook
//! body identifies it by `credential_id`), update its status, and emit
//! the matching `HoustonEvent`.
//!
//! Per CLAUDE.md "no silent failures" rule: bad signatures return 401 so
//! the integrator can see something is wrong upstream. Missing local
//! credential rows return 204 — Beltic may emit events for credentials
//! Houston never issued (different orgs sharing a webhook destination
//! is uncommon but legal), and a 204 lets Beltic stop retrying.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::Router;
use houston_beltic::WebhookVerifier;
use houston_engine_core::{
    credentials::{self, CredentialStatus},
    CoreError,
};
use houston_ui_events::HoustonEvent;
use serde::Deserialize;

use super::error::ApiError;
use crate::state::ServerState;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/webhooks/beltic", post(receive))
}

/// Beltic webhook event shape (verified against
/// `apps/api/credentials/src/operations/audit/streams` in the Beltic
/// platform repo).
#[derive(Debug, Deserialize)]
struct BelticWebhookEvent {
    #[allow(dead_code)]
    id: String,
    event_type: String,
    credential_id: String,
    #[allow(dead_code)]
    #[serde(default)]
    credential_type: Option<String>,
    #[serde(default)]
    outcome_reason: Option<String>,
}

async fn receive(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let secret = std::env::var("BELTIC_WEBHOOK_SECRET").map_err(|_| {
        ApiError(CoreError::Unavailable(
            "BELTIC_WEBHOOK_SECRET not set — engine cannot verify Beltic webhooks".into(),
        ))
    })?;
    let verifier = WebhookVerifier::new(secret).map_err(|e| {
        ApiError(CoreError::Internal(format!(
            "could not init beltic webhook verifier: {e}"
        )))
    })?;

    let sig = headers
        .get(WebhookVerifier::SIGNATURE_HEADER)
        .and_then(|v| v.to_str().ok());
    let ts = headers
        .get(WebhookVerifier::TIMESTAMP_HEADER)
        .and_then(|v| v.to_str().ok());
    let now = chrono::Utc::now().timestamp();

    verifier.verify(&body, sig, ts, now).map_err(|e| {
        ApiError(CoreError::BadRequest(format!(
            "beltic webhook signature rejected: {e}"
        )))
    })?;

    let event: BelticWebhookEvent = serde_json::from_slice(&body)
        .map_err(|e| ApiError(CoreError::BadRequest(format!("webhook body: {e}"))))?;

    apply_event(&state, event)?;

    Ok(StatusCode::NO_CONTENT)
}

/// Walk every agent under every workspace looking for a credential with
/// the given id. This is O(workspaces × agents × credentials) — fine for
/// the per-machine engine scale (single-digit workspaces, single-digit
/// agents per workspace, single-digit credentials per agent). If we ever
/// host multi-tenant Houston, swap for an index in `houston-db`.
fn apply_event(state: &ServerState, event: BelticWebhookEvent) -> Result<(), ApiError> {
    let new_status = match event.event_type.as_str() {
        "credential.issued" | "credential.reactivated" => CredentialStatus::Active,
        "credential.revoked" | "credential.deleted" => CredentialStatus::Revoked,
        "credential.suspended" => CredentialStatus::Suspended,
        _ => return Ok(()), // unknown event, ignored
    };

    let workspaces = state.engine.paths.home().join("workspaces");
    let Ok(read_dir) = std::fs::read_dir(&workspaces) else {
        return Ok(());
    };
    for ws_entry in read_dir.flatten() {
        let ws_path = ws_entry.path();
        if !ws_path.is_dir() {
            continue;
        }
        let Ok(agents) = std::fs::read_dir(&ws_path) else { continue };
        for agent_entry in agents.flatten() {
            let agent_root = agent_entry.path();
            if !agent_root.is_dir() {
                continue;
            }
            let Ok(Some(_)) =
                credentials::find_by_credential_id(&agent_root, &event.credential_id)
            else {
                continue;
            };
            credentials::update_status(
                &agent_root,
                &event.credential_id,
                new_status,
                None,
                event.outcome_reason.clone(),
            )?;
            let agent_path = agent_root.to_string_lossy().to_string();
            let evt = match new_status {
                CredentialStatus::Active => HoustonEvent::CredentialIssued {
                    agent_path,
                    credential_id: event.credential_id.clone(),
                },
                CredentialStatus::Revoked | CredentialStatus::Expired => {
                    HoustonEvent::CredentialRevoked {
                        agent_path,
                        credential_id: event.credential_id.clone(),
                    }
                }
                CredentialStatus::Suspended => HoustonEvent::CredentialSuspended {
                    agent_path,
                    credential_id: event.credential_id.clone(),
                },
            };
            state.engine.events.emit(evt);
        }
    }
    Ok(())
}
