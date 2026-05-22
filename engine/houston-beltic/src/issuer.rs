//! Typed issuance methods for Beltic credentials.
//!
//! Each credential_type has its own constructor that wraps an `IssueRequest`
//! around the right `subject` + `claims` shape. The wire format is verified
//! against `packages/schemas/src/credentials/{business,user,agent-authorization}`
//! in the Beltic platform repo:
//!
//! - `subject.type` is the British "organisation" for businesses
//! - `subject.id` for agents MUST be `did:jwk:...` (V1 constraint)
//! - `claims.delegated_by_subject_id` is REQUIRED when any
//!   `claims.permissions[].resource_type == "wallet"` (FinCEN AML)
//!
//! We enforce the wallet-permission constraint client-side too so failures
//! surface before the network round-trip.

use serde::{Deserialize, Serialize};

use crate::client::Client;
use crate::errors::{BelticError, BelticResult};

/// One issued credential, as returned by Beltic.
///
/// Field set matches the V1 API response. `claims` is left as a generic
/// `serde_json::Value` so per-type structure stays in the schemas crate
/// rather than being mirrored here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub credential_id: String,
    pub credential_type: String,
    #[serde(default)]
    pub attestation_type: Option<String>,
    pub subject: serde_json::Value,
    pub claims: serde_json::Value,
    pub issuer_did: String,
    pub kid: String,
    pub alg: String,
    pub proof_format: String,
    #[serde(default)]
    pub vct: Option<String>,
    pub signed_payload: String,
    pub status: String,
    pub status_list_index: u64,
    #[serde(default)]
    pub evidence_refs: Vec<String>,
    pub issued_at: String,
    pub expires_at: String,
    #[serde(default)]
    pub revoked_at: Option<String>,
    #[serde(default)]
    pub revocation_reason: Option<String>,
    #[serde(default)]
    pub created_via: Option<String>,
    #[serde(default)]
    pub developer_id: Option<String>,
}

/// Request body for `POST /v1/credentials`. We don't model the discriminated
/// union types explicitly — that lives in the schemas package on the Beltic
/// side. We do validate the `self_attestation_complete` gate + the FinCEN
/// delegation requirement client-side.
#[derive(Debug, Clone, Serialize)]
pub struct IssueRequest {
    pub credential_type: String,
    pub self_attestation_complete: bool,
    pub subject: serde_json::Value,
    pub claims: serde_json::Value,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttl: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct RevokeRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub struct Issuer {
    client: Client,
}

impl Issuer {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn issue(&self, request: IssueRequest) -> BelticResult<Credential> {
        if !request.self_attestation_complete {
            return Err(BelticError::SelfAttestationIncomplete(
                "client-side gate: self_attestation_complete must be true before POSTing".into(),
            ));
        }
        validate_delegation(&request)?;
        self.client.post_json::<_, Credential>("/credentials", &request).await
    }

    pub async fn revoke(&self, id: &str, reason: Option<&str>) -> BelticResult<Credential> {
        let path = format!("/credentials/{}/revoke", id);
        let body = RevokeRequest { reason };
        self.client.post_json::<_, Credential>(&path, &body).await
    }

    pub async fn get(&self, id: &str) -> BelticResult<Credential> {
        let path = format!("/credentials/{}", id);
        self.client.get_json::<Credential>(&path).await
    }
}

/// Beltic schema `.superRefine()` requires `claims.delegated_by_subject_id`
/// when any permission has `resource_type == "wallet"` (FinCEN AML). Catch
/// this before the network round-trip.
fn validate_delegation(req: &IssueRequest) -> BelticResult<()> {
    if req.credential_type != "agent_authorization" {
        return Ok(());
    }
    let perms = req
        .claims
        .get("permissions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let has_wallet = perms.iter().any(|p| {
        p.get("resource_type")
            .and_then(|v| v.as_str())
            .map(|s| s == "wallet")
            .unwrap_or(false)
    });
    if !has_wallet {
        return Ok(());
    }
    let delegated = req
        .claims
        .get("delegated_by_subject_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    if delegated.is_none() {
        return Err(BelticError::DelegationMissing);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn agent_request(claims: serde_json::Value) -> IssueRequest {
        IssueRequest {
            credential_type: "agent_authorization".into(),
            self_attestation_complete: true,
            subject: json!({
                "type": "agent",
                "id": "did:jwk:abc123",
            }),
            claims,
            evidence_refs: vec![],
            ttl: None,
        }
    }

    #[test]
    fn delegation_required_for_wallet_permissions() {
        let req = agent_request(json!({
            "permissions": [{
                "resource_type": "wallet",
                "actions": ["checkout"]
            }]
        }));
        let err = validate_delegation(&req).unwrap_err();
        assert!(matches!(err, BelticError::DelegationMissing));
    }

    #[test]
    fn delegation_satisfied_when_subject_id_present() {
        let req = agent_request(json!({
            "permissions": [{
                "resource_type": "wallet",
                "actions": ["checkout"]
            }],
            "delegated_by_subject_id": "usr_42",
        }));
        assert!(validate_delegation(&req).is_ok());
    }

    #[test]
    fn delegation_not_required_for_non_wallet_permissions() {
        let req = agent_request(json!({
            "permissions": [{
                "resource_type": "calendar",
                "actions": ["read"]
            }]
        }));
        assert!(validate_delegation(&req).is_ok());
    }

    #[test]
    fn delegation_not_required_for_non_agent_types() {
        let req = IssueRequest {
            credential_type: "user".into(),
            self_attestation_complete: true,
            subject: json!({"type": "person", "id": "usr_1"}),
            claims: json!({}),
            evidence_refs: vec![],
            ttl: None,
        };
        assert!(validate_delegation(&req).is_ok());
    }

    #[test]
    fn empty_delegated_by_treated_as_missing() {
        let req = agent_request(json!({
            "permissions": [{
                "resource_type": "wallet",
                "actions": ["checkout"]
            }],
            "delegated_by_subject_id": "",
        }));
        let err = validate_delegation(&req).unwrap_err();
        assert!(matches!(err, BelticError::DelegationMissing));
    }
}
