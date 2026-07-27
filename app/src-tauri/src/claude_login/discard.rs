//! Destroy the HANDOFF-scoped Claude credential after its push to the gateway.
//!
//! A remote-engine login mints its refresh-token family into the throwaway
//! handoff dir ([`super::claude_handoff_config_dir`]); once the credential is
//! pushed, the gateway is that family's sole rotator, and every local copy is
//! a liability — anything that ever refreshed it would trip Anthropic's
//! refresh-token-reuse detection and revoke the family for both sides
//! (HOU-950). The frontend calls this right after the push settles (success or
//! terminal failure) to delete both places the CLI caches to:
//!   1. `<handoffDir>/.credentials.json` — Linux/Windows/some macOS setups.
//!   2. The macOS Keychain item(s) under the dir-scoped service
//!      `Claude Code-credentials-<sha256(dir)[..8]>` (every account: an
//!      env-scrubbed SDK subprocess may have written a second item under
//!      another account name).
//!
//! Idempotent: nothing cached is success. A genuine deletion failure is `Err`
//! (the caller logs it — the leftover is inert, nothing ever reads or rotates
//! the handoff dir outside the login flow, and the next login overwrites it).

use std::path::Path;
use std::process::Command;

use super::{claude_handoff_config_dir, credential::keychain_service_for};

/// `security` exits 44 (`errSecItemNotFound`) when no item matches — the
/// idempotent "already gone" outcome.
const SECURITY_NOT_FOUND: i32 = 44;

/// Cap the delete loop: the CLI writes one item per account and there are at
/// most a handful of accounts; anything past this is `security` misbehaving.
const MAX_KEYCHAIN_DELETES: usize = 8;

/// Delete the handoff dir's cached credential (file + Keychain). Idempotent.
#[tauri::command(rename_all = "snake_case")]
pub async fn discard_claude_handoff_credential() -> Result<(), String> {
    let dir = claude_handoff_config_dir();
    discard(&dir, delete_keychain_items)
}

/// Core, split from the command so it is unit-testable with an injected
/// Keychain deleter (no real `security`, no `AppHandle`).
fn discard<F>(config_dir: &Path, delete_keychain: F) -> Result<(), String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    let file = config_dir.join(".credentials.json");
    match std::fs::remove_file(&file) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            return Err(format!(
                "Could not delete the handed-off Claude credential ({}): {e}",
                file.display()
            ));
        }
    }
    delete_keychain(&keychain_service_for(config_dir))
}

/// Build one `security delete-generic-password` invocation. No `-a`: each call
/// deletes the FIRST item under the service regardless of account, and the
/// caller loops until none remain. Split out so the argv is unit-testable.
fn build_delete_command(service: &str) -> Command {
    let mut cmd = Command::new("security");
    cmd.args(["delete-generic-password", "-s", service]);
    cmd
}

/// Delete every Keychain item under the dir-scoped service (macOS). Exit 44 on
/// the first call means nothing was cached — success.
#[cfg(target_os = "macos")]
fn delete_keychain_items(service: &str) -> Result<(), String> {
    for _ in 0..MAX_KEYCHAIN_DELETES {
        let output = build_delete_command(service)
            .output()
            .map_err(|e| format!("Could not access the macOS Keychain: {e}"))?;
        if output.status.success() {
            continue; // deleted one item — check for more under another account
        }
        return match output.status.code() {
            Some(SECURITY_NOT_FOUND) => Ok(()),
            code => Err(format!(
                "Could not delete the handed-off Claude Keychain item (security exited {code:?})"
            )),
        };
    }
    Err(format!(
        "Keychain still holds items under {service} after {MAX_KEYCHAIN_DELETES} deletes"
    ))
}

/// Off macOS there is no Keychain — the file delete is the whole job.
#[cfg(not(target_os = "macos"))]
fn delete_keychain_items(_service: &str) -> Result<(), String> {
    let _ = (SECURITY_NOT_FOUND, MAX_KEYCHAIN_DELETES, build_delete_command);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn unique_tmp_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "houston-claude-discard-{tag}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("mkdir temp");
        dir
    }

    #[test]
    fn deletes_the_credentials_file() {
        let dir = unique_tmp_dir("file");
        let file = dir.join(".credentials.json");
        std::fs::write(&file, r#"{"claudeAiOauth":{"accessToken":"tok"}}"#).expect("write");
        discard(&dir, |_| Ok(())).expect("discard");
        assert!(!file.exists(), "credential file must be gone");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn absent_file_is_success_and_keychain_still_runs() {
        let dir = unique_tmp_dir("absent");
        let mut keychain_ran = false;
        discard(&dir, |_| {
            keychain_ran = true;
            Ok(())
        })
        .expect("idempotent");
        assert!(keychain_ran, "the Keychain delete must run even with no file");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_delete_targets_the_dir_scoped_service() {
        let dir = unique_tmp_dir("svc");
        let expected = keychain_service_for(&dir);
        discard(&dir, |service| {
            assert_eq!(service, expected);
            Ok(())
        })
        .expect("discard");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn keychain_failure_propagates() {
        let dir = unique_tmp_dir("kcerr");
        let got = discard(&dir, |_| Err("security blew up".to_string()));
        assert_eq!(got, Err("security blew up".to_string()));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn delete_command_argv_is_scoped_to_the_service() {
        let cmd = build_delete_command("Claude Code-credentials-3d1329c5");
        assert_eq!(cmd.get_program(), "security");
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            vec![
                "delete-generic-password".to_string(),
                "-s".to_string(),
                "Claude Code-credentials-3d1329c5".to_string(),
            ]
        );
    }
}
