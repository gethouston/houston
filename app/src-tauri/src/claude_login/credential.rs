//! Extract the Anthropic OAuth credential the `claude` CLI cached for Houston's
//! shared login dir, so the desktop can PUSH it to a REMOTE engine pod.
//!
//! A co-located engine never needs this — the local runtime reads the same
//! shared `CLAUDE_CONFIG_DIR` the login wrote to. But a hosted pod can't reach
//! this machine's Keychain, so after a successful browser login the desktop
//! extracts the credential here and pushes it over the control plane.
//!
//! Read order (first VALID hit wins), scoped to the SAME dir the login wrote to
//! ([`super::claude_login_config_dir`]):
//!   1. `<claudeLoginConfigDir>/.credentials.json` — Linux/Windows, and some
//!      macOS setups. The file contents ARE the `{claudeAiOauth:{...}}` JSON.
//!   2. macOS Keychain, service `Claude Code-credentials-<sha256(dir)[..8]>`:
//!      the CLI scopes its Keychain item by `CLAUDE_CONFIG_DIR` — the service
//!      name carries the first 8 hex chars of the SHA-256 of the dir path, and
//!      the account is the username. Reading the UNSUFFIXED service
//!      `Claude Code-credentials` here would grab the credential of the user's
//!      own `~/.claude` Claude Code install — pushing THAT to a pod makes the
//!      pod and the user's personal CLI rotate the same refresh-token family
//!      and sign each other out mid-session. So the dir-scoped item is the ONLY
//!      Keychain source; if it is absent the caller degrades to the paste flow
//!      rather than risk stealing an unrelated credential.
//!
//! A candidate that exists but holds no usable token (the CLI leaves emptied
//! `{accessToken:""}` husks behind after logouts/failed refreshes) is SKIPPED,
//! not fatal. The token is NEVER logged. Not-found and parse failures return a
//! clear `Err` (→ the frontend falls back to the setup-token paste flow).

use std::path::Path;
use std::process::Command;

use sha2::{Digest, Sha256};

use super::claude_login_config_dir;

/// Base Keychain service name the `claude` CLI stores credentials under
/// (macOS). The default `~/.claude` install uses it bare; any other
/// `CLAUDE_CONFIG_DIR` gets a `-<sha256(dir)[..8]>` suffix.
const KEYCHAIN_SERVICE_BASE: &str = "Claude Code-credentials";

/// Keychain service name for a specific `CLAUDE_CONFIG_DIR`: the base name
/// plus the first 8 hex chars of the SHA-256 of the dir path — the CLI's own
/// scoping scheme, so we read exactly the item `claude auth login` wrote for
/// Houston's login dir. The hash input is the path string EXACTLY as the CLI
/// received it in `CLAUDE_CONFIG_DIR` (no normalization), which is the same
/// `claude_login_config_dir()` string the login spawn passed.
fn keychain_service_for(config_dir: &Path) -> String {
    let digest = Sha256::digest(config_dir.to_string_lossy().as_bytes());
    let prefix: String = digest
        .iter()
        .take(4)
        .map(|b| format!("{b:02x}"))
        .collect();
    format!("{KEYCHAIN_SERVICE_BASE}-{prefix}")
}

/// Read the cached Anthropic credential JSON for Houston's shared login dir and
/// return it verbatim (the CLI's `.credentials.json` shape). `Err` on
/// not-found, an unreadable file/Keychain, or malformed JSON — the caller
/// degrades to the paste flow instead of leaving a dead spinner.
#[tauri::command]
pub async fn read_claude_credential() -> Result<String, String> {
    let dir = claude_login_config_dir();
    read_credential(&dir, |service| keychain_credential(service))
}

/// Core extraction, split from the command so it is unit-testable with a fake
/// config dir + injected Keychain reader (no real `security`, no `AppHandle`).
/// `keychain` is called with the dir-scoped service name and yields the stored
/// JSON, `None` when the item is absent, or `Err` on an unexpected failure.
fn read_credential<F>(config_dir: &Path, keychain: F) -> Result<String, String>
where
    F: FnOnce(&str) -> Result<Option<String>, String>,
{
    // 1. File first (Linux/Windows/some macOS). A file that exists but is
    // empty, token-less (a logout husk), or malformed falls through to the
    // Keychain — on macOS the Keychain is the CLI's source of truth and the
    // login may have cached a fresh credential there. The file's concrete
    // problem is kept for the final error so a Linux user (no Keychain) still
    // sees WHY their file was rejected.
    let mut file_problem: Option<String> = None;
    let file = config_dir.join(".credentials.json");
    match std::fs::read_to_string(&file) {
        Ok(contents) => {
            let trimmed = contents.trim();
            if trimmed.is_empty() {
                // Treat like an absent file.
            } else {
                match validate_credential(trimmed) {
                    Ok(()) => return Ok(trimmed.to_string()),
                    Err(e) => file_problem = Some(e),
                }
            }
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

    // 2. macOS Keychain, dir-scoped service only (no-op off macOS).
    let service = keychain_service_for(config_dir);
    match keychain(&service)? {
        Some(json) => {
            let trimmed = json.trim();
            validate_credential(trimmed)?;
            Ok(trimmed.to_string())
        }
        None => Err(file_problem.unwrap_or_else(|| {
            "No cached Claude credential was found on this machine after sign-in.".to_string()
        })),
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

/// Build one `security find-generic-password` invocation. `account` narrows
/// the lookup to the login's Keychain account (the username); without it the
/// FIRST item under the service wins, which may be an emptied husk written by
/// an env-scrubbed SDK subprocess. Split out so the argv is unit-testable
/// without spawning.
fn build_keychain_command(service: &str, account: Option<&str>) -> Command {
    let mut cmd = Command::new("security");
    cmd.args(["find-generic-password", "-s", service]);
    if let Some(account) = account {
        cmd.args(["-a", account]);
    }
    cmd.arg("-w");
    cmd
}

/// Run one Keychain lookup. A non-zero exit means the item is absent
/// (`security` exits 44) — `Ok(None)`; only a spawn/decoding failure is `Err`.
#[cfg(target_os = "macos")]
fn keychain_lookup(service: &str, account: Option<&str>) -> Result<Option<String>, String> {
    let output = build_keychain_command(service, account)
        .output()
        .map_err(|e| format!("Could not read the macOS Keychain: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8(output.stdout)
        .map_err(|e| format!("The Keychain returned an invalid credential: {e}"))?;
    Ok(Some(value))
}

/// Read the credential from the macOS Keychain: the current user's account
/// first (what `claude auth login` writes), then any account under the
/// service. A hit whose payload has no usable token (an emptied logout husk)
/// is skipped so it cannot mask the real item under another account.
#[cfg(target_os = "macos")]
fn keychain_credential(service: &str) -> Result<Option<String>, String> {
    let user = std::env::var("USER").ok();
    let attempts = [user.as_deref(), None];
    let mut last_err: Option<String> = None;
    for account in attempts {
        match keychain_lookup(service, account) {
            Ok(Some(json)) => {
                if validate_credential(json.trim()).is_ok() {
                    return Ok(Some(json));
                }
                // Husk (empty tokens) — try the next candidate.
            }
            Ok(None) => {}
            Err(e) => last_err = Some(e),
        }
    }
    match last_err {
        Some(e) => Err(e),
        None => Ok(None),
    }
}

/// Off macOS there is no Keychain — the file read is the only source.
#[cfg(not(target_os = "macos"))]
fn keychain_credential(_service: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const VALID: &str = r#"{"claudeAiOauth":{"accessToken":"tok","refreshToken":"ref","expiresAt":123,"scopes":["a"]}}"#;
    const HUSK: &str = r#"{"claudeAiOauth":{"accessToken":"","refreshToken":"","expiresAt":0,"scopes":["a"]}}"#;

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
    fn keychain_service_is_scoped_by_config_dir_hash() {
        // Known vector: the CLI stores the credential for
        // /Users/daniel/.dev-houston/claude-login under
        // "Claude Code-credentials-3d1329c5" (sha256 of the path, first 8 hex).
        let service =
            keychain_service_for(Path::new("/Users/daniel/.dev-houston/claude-login"));
        assert_eq!(service, "Claude Code-credentials-3d1329c5");
    }

    #[test]
    fn different_dirs_get_different_services() {
        let a = keychain_service_for(Path::new("/a/claude-login"));
        let b = keychain_service_for(Path::new("/b/claude-login"));
        assert_ne!(a, b);
        assert!(a.starts_with("Claude Code-credentials-"));
    }

    #[test]
    fn reads_the_credentials_file_when_present() {
        let dir = unique_tmp_dir("file");
        std::fs::write(dir.join(".credentials.json"), VALID).expect("write cred");
        // Keychain must NOT be consulted once the file resolves.
        let got = read_credential(&dir, |_| panic!("keychain should not be read"));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn falls_through_empty_file_to_keychain() {
        let dir = unique_tmp_dir("empty");
        std::fs::write(dir.join(".credentials.json"), "   \n").expect("write empty");
        let got = read_credential(&dir, |_| Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn falls_through_husk_file_to_keychain() {
        // A logout leaves `{accessToken:""}` behind; the fresh login credential
        // in the Keychain must still be found.
        let dir = unique_tmp_dir("huskfile");
        std::fs::write(dir.join(".credentials.json"), HUSK).expect("write husk");
        let got = read_credential(&dir, |_| Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn reads_keychain_when_no_file() {
        let dir = unique_tmp_dir("keychain");
        // No .credentials.json written.
        let got = read_credential(&dir, |_| Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_is_asked_for_the_dir_scoped_service() {
        let dir = unique_tmp_dir("svc");
        let expected = keychain_service_for(&dir);
        let got = read_credential(&dir, |service| {
            assert_eq!(service, expected);
            Ok(Some(VALID.to_string()))
        });
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn not_found_errors_when_file_and_keychain_absent() {
        let dir = unique_tmp_dir("missing");
        let got = read_credential(&dir, |_| Ok(None));
        let err = got.expect_err("must be not-found");
        assert!(
            err.contains("No cached Claude credential"),
            "err was: {err}"
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn malformed_file_json_falls_through_to_keychain() {
        // A corrupt file must not dead-end the flow when the Keychain holds the
        // real credential (the CLI treats the Keychain as its source of truth
        // on macOS).
        let dir = unique_tmp_dir("garbage");
        std::fs::write(dir.join(".credentials.json"), "not json{").expect("write garbage");
        let got = read_credential(&dir, |_| Ok(Some(VALID.to_string())));
        assert_eq!(got.as_deref(), Ok(VALID));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn missing_token_everywhere_reports_the_file_problem() {
        // With nothing in the Keychain, the file's concrete rejection reason is
        // what the Linux/self-host user needs to see.
        let dir = unique_tmp_dir("notoken");
        std::fs::write(dir.join(".credentials.json"), r#"{"claudeAiOauth":{}}"#).expect("write");
        let got = read_credential(&dir, |_| Ok(None));
        let err = got.expect_err("must reject missing token");
        assert!(
            err.contains("missing its access token"),
            "err was: {err}"
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_husk_from_injected_reader_errors_as_invalid() {
        // The injected reader models `keychain_credential` AFTER its own
        // husk-skipping: if it still returns a husk, validation rejects it
        // loudly rather than pushing an empty token to a pod.
        let dir = unique_tmp_dir("huskkc");
        let got = read_credential(&dir, |_| Ok(Some(HUSK.to_string())));
        let err = got.expect_err("must reject the husk");
        assert!(err.contains("missing its access token"), "err was: {err}");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_error_propagates() {
        let dir = unique_tmp_dir("kcerr");
        let got = read_credential(&dir, |_| Err("security blew up".to_string()));
        assert_eq!(got, Err("security blew up".to_string()));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_command_argv_is_scoped_to_service_and_account() {
        let cmd = build_keychain_command("Claude Code-credentials-3d1329c5", Some("daniel"));
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
                "Claude Code-credentials-3d1329c5".to_string(),
                "-a".to_string(),
                "daniel".to_string(),
                "-w".to_string(),
            ]
        );
    }

    #[test]
    fn keychain_command_argv_without_account() {
        let cmd = build_keychain_command("Claude Code-credentials-3d1329c5", None);
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            vec![
                "find-generic-password".to_string(),
                "-s".to_string(),
                "Claude Code-credentials-3d1329c5".to_string(),
                "-w".to_string(),
            ]
        );
    }
}
