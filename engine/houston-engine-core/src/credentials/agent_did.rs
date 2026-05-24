//! Persist the agent's ES256 private JWK on disk so future presentation
//! flows (the agent signing a Verifiable Presentation, e.g. AP2 / UCP)
//! have a key to sign with. Stored at
//! `<agent_root>/.houston/agent_did/private.json`. Owner-only on Unix
//! (mode 0600). Houston doesn't currently encrypt other on-disk secrets
//! (the bearer token, provider creds, etc.), so this matches the
//! existing posture; an at-rest-encryption follow-up should cover all
//! of them together rather than singling this one out.

use std::path::Path;

use crate::agents::store::{ensure_houston_dir, read_json, write_json};
use crate::error::CoreResult;

const FILE: &str = "agent_did";

/// Persist the private JWK for an agent. Idempotent — overwrites any
/// prior key. The DID is freshly minted on every Beltic agent
/// authorization so a re-authorize cycles to a new keypair.
pub fn save_private_jwk(root: &Path, private_jwk: &serde_json::Value) -> CoreResult<()> {
    ensure_houston_dir(root)?;
    write_json(root, FILE, private_jwk)?;
    set_owner_only(root)?;
    Ok(())
}

/// Read the stored private JWK if present.
pub fn load_private_jwk(root: &Path) -> CoreResult<Option<serde_json::Value>> {
    let value: serde_json::Value = read_json(root, FILE)?;
    if value.is_null() || (value.is_object() && value.as_object().is_some_and(|m| m.is_empty())) {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

#[cfg(unix)]
fn set_owner_only(root: &Path) -> CoreResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let path = root.join(".houston").join(FILE).join(format!("{FILE}.json"));
    if path.exists() {
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms).map_err(|e| {
            crate::error::CoreError::Internal(format!("chmod 0600 on agent_did: {e}"))
        })?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_owner_only(_root: &Path) -> CoreResult<()> {
    // Windows: NTFS ACLs differ; rely on per-user profile permissions.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[test]
    fn save_then_load_round_trips() {
        let tmp = TempDir::new().unwrap();
        let jwk = json!({"kty": "EC", "crv": "P-256", "x": "xxx", "y": "yyy", "d": "ddd"});
        assert!(load_private_jwk(tmp.path()).unwrap().is_none());
        save_private_jwk(tmp.path(), &jwk).unwrap();
        let loaded = load_private_jwk(tmp.path()).unwrap().unwrap();
        assert_eq!(loaded["d"], "ddd");
    }

    #[cfg(unix)]
    #[test]
    fn private_jwk_file_is_mode_0600() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new().unwrap();
        let jwk = json!({"d": "ddd"});
        save_private_jwk(tmp.path(), &jwk).unwrap();
        let path = tmp
            .path()
            .join(".houston")
            .join("agent_did")
            .join("agent_did.json");
        let meta = std::fs::metadata(&path).unwrap();
        let mode = meta.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "expected 0600 got {mode:o}");
    }

    #[test]
    fn save_overwrites_prior_jwk() {
        let tmp = TempDir::new().unwrap();
        save_private_jwk(tmp.path(), &json!({"d": "first"})).unwrap();
        save_private_jwk(tmp.path(), &json!({"d": "second"})).unwrap();
        let loaded = load_private_jwk(tmp.path()).unwrap().unwrap();
        assert_eq!(loaded["d"], "second");
    }
}
