//! Workspace-scoped identity credential — the user's Beltic `user`
//! credential lives at the workspace root, not per-agent.
//!
//! Pattern is identical to [`super::store`] but the file lives at
//! `<workspace_root>/.houston/identity/identity.json` instead of inside
//! an agent. Same `Vec<VerifiableCredential>` shape — re-verifying creates
//! a new active row; the previous one is revoked but kept on disk.

use std::path::Path;

use crate::agents::store::{read_json, write_json};
use crate::error::{CoreError, CoreResult};

use super::types::{CredentialStatus, NewCredential, VerifiableCredential};

const FILE: &str = "identity";

pub fn list(workspace_root: &Path) -> CoreResult<Vec<VerifiableCredential>> {
    read_json::<Vec<VerifiableCredential>>(workspace_root, FILE)
}

pub fn active(workspace_root: &Path) -> CoreResult<Option<VerifiableCredential>> {
    let mut items = list(workspace_root)?;
    items.reverse();
    Ok(items.into_iter().find(|c| c.status.is_active()))
}

pub fn find_by_credential_id(
    workspace_root: &Path,
    credential_id: &str,
) -> CoreResult<Option<VerifiableCredential>> {
    Ok(list(workspace_root)?
        .into_iter()
        .find(|c| c.credential_id == credential_id))
}

pub fn save(
    workspace_root: &Path,
    input: NewCredential,
) -> CoreResult<VerifiableCredential> {
    let mut items = list(workspace_root)?;
    if items.iter().any(|c| c.credential_id == input.credential_id) {
        return Err(CoreError::Conflict(format!(
            "identity credential {} already persisted",
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
    write_json(workspace_root, FILE, &items)?;
    Ok(row)
}

pub fn update_status(
    workspace_root: &Path,
    credential_id: &str,
    new_status: CredentialStatus,
    revoked_at: Option<String>,
    revocation_reason: Option<String>,
) -> CoreResult<VerifiableCredential> {
    let mut items = list(workspace_root)?;
    let row = items
        .iter_mut()
        .find(|c| c.credential_id == credential_id)
        .ok_or_else(|| CoreError::NotFound(format!("identity credential {credential_id}")))?;
    row.status = new_status;
    if new_status == CredentialStatus::Revoked {
        row.revoked_at = revoked_at.or_else(|| Some(chrono::Utc::now().to_rfc3339()));
        if revocation_reason.is_some() {
            row.revocation_reason = revocation_reason;
        }
    }
    let cloned = row.clone();
    write_json(workspace_root, FILE, &items)?;
    Ok(cloned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn sample(id: &str) -> NewCredential {
        NewCredential {
            credential_id: id.into(),
            credential_type: "user".into(),
            subject_type: "person".into(),
            subject_id: "usr_42".into(),
            issuer_did: "did:web:beltic.com".into(),
            kid: "kid_a".into(),
            alg: "ES256".into(),
            signed_payload: "eyJ.eyJ.sig".into(),
            claims: json!({"kyc_status": "approved", "trust_level": "idv_verified"}),
            issued_at: "2026-05-22T10:00:00Z".into(),
            expires_at: "2027-05-22T10:00:00Z".into(),
            delegated_by_subject_id: None,
            status_list_index: 7,
        }
    }

    #[test]
    fn save_and_find_workspace_identity_credential() {
        let tmp = TempDir::new().unwrap();
        let row = save(tmp.path(), sample("cred_user_1")).unwrap();
        assert_eq!(row.credential_type, "user");
        assert!(find_by_credential_id(tmp.path(), "cred_user_1")
            .unwrap()
            .is_some());
    }

    #[test]
    fn active_returns_most_recent_after_reverification() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), sample("cred_old")).unwrap();
        // The user re-verifies — old one gets revoked, new one is issued
        update_status(
            tmp.path(),
            "cred_old",
            CredentialStatus::Revoked,
            None,
            Some("re-verified".into()),
        )
        .unwrap();
        save(tmp.path(), sample("cred_new")).unwrap();
        let active = active(tmp.path()).unwrap().unwrap();
        assert_eq!(active.credential_id, "cred_new");
    }
}
