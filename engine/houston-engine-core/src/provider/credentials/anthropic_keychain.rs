//! Materialize Anthropic OAuth credentials for cloud export.
//!
//! Codex OAuth lives in `~/.codex/auth.json` on every platform, so export
//! works out of the box. Claude Code on macOS stores subscription OAuth in
//! the `Claude Code-credentials` keychain entry instead of
//! `~/.claude/.credentials.json`. Linux pods import the file shape, so export
//! must synthesize it from the keychain when the file is absent.

use serde_json::Value;

const CREDENTIALS_REL: &str = ".claude/.credentials.json";
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";

/// Bytes for `.claude/.credentials.json` when exportable OAuth exists.
pub fn claude_oauth_credentials_bytes() -> Option<Vec<u8>> {
    if let Some(bytes) = read_credentials_file() {
        return Some(bytes);
    }
    #[cfg(target_os = "macos")]
    {
        return read_macos_keychain_credentials();
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

fn read_credentials_file() -> Option<Vec<u8>> {
    let home = dirs::home_dir()?;
    let path = home.join(".claude").join(".credentials.json");
    let bytes = std::fs::read(&path).ok()?;
    let content = std::str::from_utf8(&bytes).ok()?;
    credentials_json_from_value(serde_json::from_str(content).ok()?)
}

#[cfg(target_os = "macos")]
fn read_macos_keychain_credentials() -> Option<Vec<u8>> {
    let username = std::process::Command::new("whoami")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())?;
    if username.is_empty() {
        return None;
    }
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            &username,
            "-w",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: Value = serde_json::from_str(json_str.trim()).ok()?;
    credentials_json_from_value(data)
}

/// Normalize Claude OAuth into the on-disk credentials file shape.
pub(crate) fn credentials_json_from_value(data: Value) -> Option<Vec<u8>> {
    let oauth = data.get("claudeAiOauth")?;
    let token = oauth
        .get("accessToken")
        .and_then(|t| t.as_str())
        .filter(|s| !s.is_empty())?;
    let _ = token;
    let file = serde_json::json!({ "claudeAiOauth": oauth });
    serde_json::to_vec(&file).ok()
}

pub fn credentials_rel_path() -> &'static str {
    CREDENTIALS_REL
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;

    #[test]
    fn credentials_json_from_value_requires_non_empty_access_token() {
        let bytes = credentials_json_from_value(serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat01-test",
                "refreshToken": "r",
                "expiresAt": 1
            }
        }))
        .unwrap();
        let parsed: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            parsed["claudeAiOauth"]["accessToken"].as_str(),
            Some("sk-ant-oat01-test")
        );
    }

    #[test]
    fn credentials_json_from_value_rejects_empty_token() {
        assert!(credentials_json_from_value(serde_json::json!({
            "claudeAiOauth": { "accessToken": "" }
        }))
        .is_none());
        assert!(credentials_json_from_value(serde_json::json!({})).is_none());
    }

    #[test]
    fn read_credentials_file_round_trip_from_disk() {
        let _guard = lock_env_test();
        let tmp = tempfile::TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        std::env::set_var("HOME", tmp.path());
        let creds_dir = tmp.path().join(".claude");
        std::fs::create_dir_all(&creds_dir).unwrap();
        std::fs::write(
            creds_dir.join(".credentials.json"),
            r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-disk","refreshToken":"r","expiresAt":1}}"#,
        )
        .unwrap();
        let bytes = read_credentials_file().expect("file export");
        let parsed: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            parsed["claudeAiOauth"]["accessToken"].as_str(),
            Some("sk-ant-oat01-disk")
        );
        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
    }
}
