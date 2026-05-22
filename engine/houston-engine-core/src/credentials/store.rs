//! Agent-scoped CRUD over `.houston/credentials/credentials.json`.
//!
//! Mirrors the pattern in `agents::activity` — append-only `Vec`, newest
//! last, the active credential is the most recent row with `status ==
//! Active`. Status changes are mutations on existing rows (driven by
//! Beltic webhooks); we never delete rows here so the audit trail stays
//! intact.

use std::path::Path;

use crate::agents::store::{read_json, write_json};
use crate::error::{CoreError, CoreResult};

use super::types::{CredentialStatus, NewCredential, VerifiableCredential};

const FILE: &str = "credentials";

/// All credentials persisted for this agent root, newest last.
pub fn list(root: &Path) -> CoreResult<Vec<VerifiableCredential>> {
    read_json::<Vec<VerifiableCredential>>(root, FILE)
}

/// The most-recent credential with `status == Active`, or `None`.
pub fn active(root: &Path) -> CoreResult<Option<VerifiableCredential>> {
    let mut items = list(root)?;
    items.reverse();
    Ok(items.into_iter().find(|c| c.status.is_active()))
}

pub fn find_by_credential_id(
    root: &Path,
    credential_id: &str,
) -> CoreResult<Option<VerifiableCredential>> {
    Ok(list(root)?
        .into_iter()
        .find(|c| c.credential_id == credential_id))
}

/// Append a freshly-issued credential. Rejects duplicates by
/// `credential_id` so re-running an issuance job doesn't create a phantom
/// row.
pub fn save(root: &Path, input: NewCredential) -> CoreResult<VerifiableCredential> {
    let mut items = list(root)?;
    if items.iter().any(|c| c.credential_id == input.credential_id) {
        return Err(CoreError::Conflict(format!(
            "credential {} already persisted",
            input.credential_id
        )));
    }
    let row = VerifiableCredential {
        credential_id: input.credential_id,
        credential_type: input.credential_type,
        subject_type: input.subject_type,
        subject_id: input.subject_id,
        status: CredentialStatus::Active,
        issuer_did: input.issuer_did,
        kid: input.kid,
        alg: input.alg,
        signed_payload: input.signed_payload,
        claims: input.claims,
        issued_at: input.issued_at,
        expires_at: input.expires_at,
        revoked_at: None,
        revocation_reason: None,
        delegated_by_subject_id: input.delegated_by_subject_id,
        status_list_index: input.status_list_index,
    };
    items.push(row.clone());
    write_json(root, FILE, &items)?;
    Ok(row)
}

/// Mutate the `status` (and `revoked_at` if transitioning to Revoked) on
/// the row with the matching `credential_id`. Idempotent: calling with the
/// same status is a no-op.
pub fn update_status(
    root: &Path,
    credential_id: &str,
    new_status: CredentialStatus,
    revoked_at: Option<String>,
    revocation_reason: Option<String>,
) -> CoreResult<VerifiableCredential> {
    let mut items = list(root)?;
    let row = items
        .iter_mut()
        .find(|c| c.credential_id == credential_id)
        .ok_or_else(|| CoreError::NotFound(format!("credential {credential_id}")))?;
    row.status = new_status;
    if new_status == CredentialStatus::Revoked {
        row.revoked_at = revoked_at.or_else(|| Some(chrono::Utc::now().to_rfc3339()));
        if revocation_reason.is_some() {
            row.revocation_reason = revocation_reason;
        }
    }
    let cloned = row.clone();
    write_json(root, FILE, &items)?;
    Ok(cloned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn sample(credential_id: &str) -> NewCredential {
        NewCredential {
            credential_id: credential_id.into(),
            credential_type: "agent_authorization".into(),
            subject_type: "agent".into(),
            subject_id: "did:jwk:abc".into(),
            issuer_did: "did:web:beltic.com".into(),
            kid: "kid_a".into(),
            alg: "ES256".into(),
            signed_payload: "eyJ.eyJ.sig".into(),
            claims: json!({"permissions": []}),
            issued_at: "2026-05-22T10:00:00Z".into(),
            expires_at: "2027-05-22T10:00:00Z".into(),
            delegated_by_subject_id: Some("usr_42".into()),
            status_list_index: 17,
        }
    }

    #[test]
    fn list_is_empty_for_fresh_agent() {
        let tmp = TempDir::new().unwrap();
        assert!(list(tmp.path()).unwrap().is_empty());
        assert!(active(tmp.path()).unwrap().is_none());
    }

    #[test]
    fn save_creates_then_finds_by_credential_id() {
        let tmp = TempDir::new().unwrap();
        let row = save(tmp.path(), sample("cred_x")).unwrap();
        assert_eq!(row.status, CredentialStatus::Active);
        assert_eq!(row.credential_id, "cred_x");

        let found = find_by_credential_id(tmp.path(), "cred_x").unwrap().unwrap();
        assert_eq!(found.credential_id, "cred_x");
        assert_eq!(found.delegated_by_subject_id.as_deref(), Some("usr_42"));
    }

    #[test]
    fn save_rejects_duplicate_credential_id() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_x")).unwrap();
        let err = save(tmp.path(), sample("cred_x")).unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));
    }

    #[test]
    fn active_returns_most_recent_active() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_old")).unwrap();
        save(tmp.path(), sample("cred_new")).unwrap();
        let active = active(tmp.path()).unwrap().unwrap();
        // newest is last in the list — active() should return it
        assert_eq!(active.credential_id, "cred_new");
    }

    #[test]
    fn active_skips_revoked_rows() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_active")).unwrap();
        save(tmp.path(), sample("cred_revoked")).unwrap();
        update_status(
            tmp.path(),
            "cred_revoked",
            CredentialStatus::Revoked,
            None,
            Some("test".into()),
        )
        .unwrap();
        let active = active(tmp.path()).unwrap().unwrap();
        assert_eq!(active.credential_id, "cred_active");
    }

    #[test]
    fn update_status_sets_revoked_at_when_transitioning_to_revoked() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_x")).unwrap();
        let row = update_status(
            tmp.path(),
            "cred_x",
            CredentialStatus::Revoked,
            Some("2026-05-22T11:00:00Z".into()),
            Some("revoked_by_user".into()),
        )
        .unwrap();
        assert_eq!(row.status, CredentialStatus::Revoked);
        assert_eq!(row.revoked_at.as_deref(), Some("2026-05-22T11:00:00Z"));
        assert_eq!(row.revocation_reason.as_deref(), Some("revoked_by_user"));
    }

    #[test]
    fn update_status_not_found_returns_not_found_error() {
        let tmp = TempDir::new().unwrap();
        let err = update_status(
            tmp.path(),
            "cred_nope",
            CredentialStatus::Suspended,
            None,
            None,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[test]
    fn update_status_to_suspended_does_not_set_revoked_at() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_x")).unwrap();
        let row = update_status(
            tmp.path(),
            "cred_x",
            CredentialStatus::Suspended,
            None,
            None,
        )
        .unwrap();
        assert_eq!(row.status, CredentialStatus::Suspended);
        assert!(row.revoked_at.is_none());
    }
}
