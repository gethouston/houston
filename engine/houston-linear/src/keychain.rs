//! macOS keychain storage for Linear OAuth tokens.
//!
//! Mirrors `engine/houston-composio/src/auth.rs` keychain idiom — uses
//! the `security` subprocess to read/write a single `Houston-Linear`
//! generic password entry keyed by the unix username. Each entry holds a
//! JSON object of the form:
//!
//! ```json
//! {
//!   "<org_id>": {
//!     "accessToken": "...",
//!     "refreshToken": "...",
//!     "expiresAt": 1734567890,
//!     "tokenType": "Bearer",
//!     "scope": "read write app:assignable app:mentionable webhook:write",
//!     "webhookSecret": "..."
//!   },
//!   "<other_org_id>": { ... }
//! }
//! ```
//!
//! One Linear OAuth-app can connect multiple orgs (each Houston workspace
//! binds to one org); keyed by `org_id` so each workspace's tokens are
//! independent.
//!
//! The on-disk `connection.json` stores only `org_id` — the lookup key.
//! Tokens never leave the keychain.

use crate::error::LinearError;

const SERVICE: &str = "Houston-Linear-credentials";

/// One Linear OAuth org's full set of tokens + metadata. Read/write
/// boundary between the engine and the macOS keychain.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Unix epoch seconds.
    pub expires_at: Option<u64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    /// Per-org webhook HMAC secret (if registered).
    pub webhook_secret: Option<String>,
}

/// Store tokens for `org_id`, replacing any prior entry for that org.
///
/// Atomic via `security add-generic-password -U` (update flag); the
/// full JSON blob is rewritten on every call so partial writes can't
/// corrupt other orgs' entries.
pub fn store(org_id: &str, tokens: &StoredTokens) -> Result<(), LinearError> {
    let username = whoami()?;
    let mut all = read_all(&username).unwrap_or_else(|_| serde_json::Map::new());
    let value = serde_json::to_value(tokens).map_err(LinearError::Json)?;
    all.insert(org_id.to_string(), value);
    write_all(&username, &all)
}

/// Load tokens for `org_id`. Returns [`LinearError::NotAuthenticated`]
/// when the entry is missing (caller surfaces a "Connect Linear" UI
/// affordance per the no-silent-failures policy).
pub fn load(org_id: &str) -> Result<StoredTokens, LinearError> {
    let username = whoami()?;
    let all = read_all(&username)?;
    let entry = all
        .get(org_id)
        .ok_or(LinearError::NotAuthenticated)?
        .clone();
    serde_json::from_value(entry).map_err(LinearError::Json)
}

/// Remove tokens for `org_id`. Idempotent — missing entries return Ok.
pub fn delete(org_id: &str) -> Result<(), LinearError> {
    let username = whoami()?;
    let mut all = read_all(&username).unwrap_or_else(|_| serde_json::Map::new());
    all.remove(org_id);
    write_all(&username, &all)
}

// -- internal subprocess wrappers --

fn whoami() -> Result<String, LinearError> {
    let output = std::process::Command::new("whoami")
        .output()
        .map_err(|e| LinearError::Keychain(format!("whoami failed: {e}")))?;
    if !output.status.success() {
        return Err(LinearError::Keychain("whoami exited non-zero".into()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_all(username: &str) -> Result<serde_json::Map<String, serde_json::Value>, LinearError> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", SERVICE, "-a", username, "-w"])
        .output()
        .map_err(|e| LinearError::Keychain(format!("security find failed: {e}")))?;

    if !output.status.success() {
        // No entry yet — fresh state, not an error per se.
        return Ok(serde_json::Map::new());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let trimmed = json_str.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::Map::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| LinearError::Keychain(format!("keychain JSON parse: {e}")))?;
    match value {
        serde_json::Value::Object(map) => Ok(map),
        _ => Err(LinearError::Keychain(
            "keychain entry was not a JSON object".into(),
        )),
    }
}

fn write_all(
    username: &str,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), LinearError> {
    let json = serde_json::to_string(&serde_json::Value::Object(map.clone()))
        .map_err(LinearError::Json)?;

    let status = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            SERVICE,
            "-a",
            username,
            "-w",
            &json,
        ])
        .status()
        .map_err(|e| LinearError::Keychain(format!("security add failed: {e}")))?;

    if !status.success() {
        return Err(LinearError::Keychain(
            "security add-generic-password exited non-zero".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_tokens_round_trip_json() {
        let t = StoredTokens {
            access_token: "atk".into(),
            refresh_token: Some("rtk".into()),
            expires_at: Some(1_716_473_400),
            token_type: Some("Bearer".into()),
            scope: Some("read write".into()),
            webhook_secret: Some("whsec".into()),
        };
        let json = serde_json::to_string(&t).unwrap();
        let back: StoredTokens = serde_json::from_str(&json).unwrap();
        assert_eq!(t, back);
    }

    #[test]
    fn missing_optional_fields_deserialize_as_none() {
        let json = r#"{"access_token":"atk"}"#;
        let t: StoredTokens = serde_json::from_str(json).unwrap();
        assert_eq!(t.access_token, "atk");
        assert!(t.refresh_token.is_none());
        assert!(t.expires_at.is_none());
        assert!(t.webhook_secret.is_none());
    }
}
