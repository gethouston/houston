//! Domain types for stored Beltic credentials.
//!
//! The shape is a deliberate subset of Beltic's API response (see
//! `houston-beltic::issuer::Credential`) — we keep only what Houston needs
//! for verification, UI rendering, and audit. Notably we keep
//! `signed_payload` (the JWT-VC string) because the verifier needs it at
//! transaction time; at-rest encryption happens before this hits disk via
//! the cryptography layer added in chunk 3.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CredentialStatus {
    Active,
    Suspended,
    Revoked,
    Expired,
}

impl CredentialStatus {
    pub fn is_active(self) -> bool {
        matches!(self, Self::Active)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiableCredential {
    /// Beltic's `credential_id` (e.g., `cred_a8f3…`). Stable across status
    /// changes; not the same as Houston's local row id since we don't have
    /// one — we key by Beltic's id.
    pub credential_id: String,
    pub credential_type: String,
    /// Beltic subject.type — "person" | "agent" | "organisation".
    pub subject_type: String,
    /// Beltic subject.id (e.g., "usr_42", "did:jwk:…", "org_houston_…").
    pub subject_id: String,
    pub status: CredentialStatus,
    pub issuer_did: String,
    pub kid: String,
    pub alg: String,
    /// The signed JWT-VC. The verifier needs this to authenticate the
    /// credential at transaction time without round-tripping to Beltic.
    pub signed_payload: String,
    /// Full Beltic claims object as JSON — preserves the shape since
    /// per-type claim contents vary (kyc_status, kyb_status, permissions,
    /// spend_limit, …).
    pub claims: serde_json::Value,
    /// ISO-8601 timestamps — kept as String to round-trip Beltic's wire
    /// format without precision loss.
    pub issued_at: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub revocation_reason: Option<String>,
    /// For agent_authorization credentials: the user's Beltic subject.id
    /// (e.g., "usr_42") that delegated authority to this agent. Always
    /// present on wallet-permission credentials per FinCEN AML.
    pub delegated_by_subject_id: Option<String>,
    /// Position in Beltic's revocation bitstring. The verifier checks the
    /// bit at this index against the Status List 2021 endpoint.
    pub status_list_index: u64,
}

/// Input for `save` — what the integration layer hands us after a
/// successful Beltic issuance. We don't accept a `status` here because
/// every freshly-issued credential is `Active`; status mutations happen
/// only via `update_status` (driven by webhooks or by Houston's own
/// revoke action).
#[derive(Debug, Clone)]
pub struct NewCredential {
    pub credential_id: String,
    pub credential_type: String,
    pub subject_type: String,
    pub subject_id: String,
    pub issuer_did: String,
    pub kid: String,
    pub alg: String,
    pub signed_payload: String,
    pub claims: serde_json::Value,
    pub issued_at: String,
    pub expires_at: String,
    pub delegated_by_subject_id: Option<String>,
    pub status_list_index: u64,
}
