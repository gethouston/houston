//! Extract the Anthropic OAuth credential the `claude` CLI cached for Houston's
//! shared login dir, so the desktop can PUSH it to a REMOTE engine pod.
//!
//! A co-located engine never needs this — the local runtime reads the same
//! shared `CLAUDE_CONFIG_DIR` the login wrote to. But a hosted pod can't reach
//! this machine's Keychain, so after a successful browser login the desktop
//! extracts the credential here and pushes it over the control plane.
//!
//! Read order (first hit wins), scoped to the SAME dir the login wrote to
//! ([`super::claude_login_config_dir`]):
//!   1. `<claudeLoginConfigDir>/.credentials.json` — Linux/Windows, and some
//!      macOS setups. The file contents ARE the `{claudeAiOauth:{...}}` JSON.
//!   2. macOS Keychain: `security find-generic-password -s "Claude Code-credentials" -w`
//!      — the returned password IS that same JSON.
//!
//! The token is NEVER logged. Not-found and parse failures return a clear `Err`
//! (→ the frontend falls back to the setup-token paste flow).

use std::path::Path;
use std::process::Command;

use super::claude_login_config_dir;

/// Keychain service name the `claude` CLI stores its credential under (macOS).
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";

/// Read the cached Anthropic credential JSON for Houston's shared login dir and
/// return it verbatim (the CLI's `.credentials.json` shape). `Err` on
/// not-found, an unreadable file/Keychain, or malformed JSON — the caller
/// degrades to the paste flow instead of leaving a dead spinner.
#[tauri::command]
pub async fn read_claude_credential() -> Result<String, String> {
    let dir = claude_login_config_dir();
    read_credential(&dir, keychain_credential)
}

/// Core extraction, split from the command so it is unit-testable with a fake
/// config dir + injected Keychain reader (no real `security`, no `AppHandle`).
/// `keychain` yields the stored JSON, `None` when the item is absent, or `Err`
/// on an unexpected failure.
fn read_credential<F>(config_dir: &Path, keychain: F) -> Result<String, String>
where
    F: FnOnce() -> Result<Option<String>, String>,
{
    // 1. File first (Linux/Windows/some macOS).
    let file = config_dir.join(".credentials.json");
    match std::fs::read_to_string(&file) {
        Ok(contents) => {
            let trimmed = contents.trim();
            if !trimmed.is_empty() {
                validate_credential(trimmed)?;
                return Ok(trimmed.to_string());
            }
            // Empty file — treat as absent and fall through to the Keychain.
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // No file on this platform/setup — fall through to the Keychain.
        }
        Err(e) => {
            return Err(format!(
                "Could not read the cached Claude credential ({}): {e}",
                file.display()
            ));
        }
    }

    // 2. macOS Keychain (no-op off macOS).
    match keychain()? {
        Some(json) => {
            let trimmed = json.trim();
            validate_credential(trimmed)?;
            Ok(trimmed.to_string())
        }
        None => {
            Err("No cached Claude credential was found on this machine after sign-in.".to_string())
        }
    }
}

/// Confirm the extracted blob is the expected `{claudeAiOauth:{accessToken}}`
/// JSON. Parses (never logging the token) so a truncated/garbage cache surfaces
/// as a clear error rather than being pushed to the pod and failing there.
fn validate_credential(json: &str) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| format!("The cached Claude credential is not valid JSON: {e}"))?;
    let has_token = parsed
        .get("claudeAiOauth")
        .and_then(|o| o.get("accessToken"))
        .and_then(|v| v.as_str())
        .is_some_and(|s| !s.is_empty());
    if !has_token {
        return Err("The cached Claude credential is missing its access token.".to_string());
    }
    Ok(())
}

/// Build the `security find-generic-password -s "Claude Code-credentials" -w`
/// command. Split out so the argv is unit-testable without spawning.
fn build_keychain_command() -> Command {
    let mut cmd = Command::new("security");
    cmd.args(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]);
    cmd
}

/// Read the credential from the macOS Keychain. A non-zero exit means the item
/// is absent (`security` exits 44) — that is `Ok(None)`, not an error; only a
/// spawn/decoding failure is an `Err`.
#[cfg(target_os = "macos")]
fn keychain_credential() -> Result<Option<String>, String> {
    let output = build_keychain_command()
        .output()
        .map_err(|e| format!("Could not read the macOS Keychain: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8(output.stdout)
        .map_err(|e| format!("The Keychain returned an invalid credential: {e}"))?;
    Ok(Some(value))
}

/// Off macOS there is no Keychain — the file read is the only source.
#[cfg(not(target_os = "macos"))]
fn keychain_credential() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const VALID: &str = r#"{"claudeAiOauth":{"accessToken":"tok","refreshToken":"ref","expiresAt":123,"scopes":["a"]}}"#;

    fn unique_tmp_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "houston-claude-cred-{tag}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("mkdir temp");
        dir
    }

    #[test]
    fn reads_the_credentials_file_when_present() {
        let dir = unique_tmp_dir("file");
        std::fs::write(dir.join(".credentials.json"), VALID).expect("write cred");
        // Keychain must NOT be consulted once the file resolves.
        let got = read_credential(&dir, || panic!("keychain should not be read"));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn falls_through_empty_file_to_keychain() {
        let dir = unique_tmp_dir("empty");
        std::fs::write(dir.join(".credentials.json"), "   \n").expect("write empty");
        let got = read_credential(&dir, || Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn reads_keychain_when_no_file() {
        let dir = unique_tmp_dir("keychain");
        // No .credentials.json written.
        let got = read_credential(&dir, || Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn not_found_errors_when_file_and_keychain_absent() {
        let dir = unique_tmp_dir("missing");
        let got = read_credential(&dir, || Ok(None));
        let err = got.expect_err("must be not-found");
        assert!(
            err.contains("No cached Claude credential"),
            "err was: {err}"
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn malformed_file_json_errors() {
        let dir = unique_tmp_dir("garbage");
        std::fs::write(dir.join(".credentials.json"), "not json{").expect("write garbage");
        let got = read_credential(&dir, || panic!("keychain should not be read"));
        let err = got.expect_err("must be a parse error");
        assert!(err.contains("not valid JSON"), "err was: {err}");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn missing_token_field_errors() {
        let dir = unique_tmp_dir("notoken");
        std::fs::write(dir.join(".credentials.json"), r#"{"claudeAiOauth":{}}"#).expect("write");
        let got = read_credential(&dir, || panic!("keychain should not be read"));
        let err = got.expect_err("must reject missing token");
        assert!(err.contains("missing its access token"), "err was: {err}");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_error_propagates() {
        let dir = unique_tmp_dir("kcerr");
        let got = read_credential(&dir, || Err("security blew up".to_string()));
        assert_eq!(got, Err("security blew up".to_string()));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_command_argv_is_scoped_to_the_claude_service() {
        let cmd = build_keychain_command();
        assert_eq!(cmd.get_program(), "security");
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            vec![
                "find-generic-password".to_string(),
                "-s".to_string(),
                "Claude Code-credentials".to_string(),
                "-w".to_string(),
            ]
        );
    }
}
