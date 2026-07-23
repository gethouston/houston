//! Relay a pasted authorization code to the running `claude auth login` child.
//!
//! The current CLI authorizes with `code=true`: the browser redirect lands on
//! platform.claude.com, which tries to hand the code to the CLI's local
//! listener automatically (the seamless path). When that hand-off is blocked
//! (firewalls, strict browsers — the common case on Windows), the page shows
//! the user a code and the CLI waits on `Paste code here if prompted >`. The
//! sign-in dialog collects that code and this command writes it to the child's
//! piped stdin, letting the CLI finish its own token exchange.

use std::sync::Arc;

use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio::process::ChildStdin;

use super::ClaudeLoginState;

/// Shared slot for the login child's stdin. `start_claude_login` fills it per
/// attempt; the submit command drains writes through it. `None` after the
/// child was spawned without a pipe (never in production) or the slot was
/// never armed.
pub(super) type StdinSlot = Arc<tokio::sync::Mutex<Option<ChildStdin>>>;

/// Write the pasted code (plus newline, as the CLI's readline expects) to the
/// login child's stdin. Split from the command so the whole paste path is
/// unit-testable against a fake `claude` script without Tauri state.
pub(super) async fn write_login_code(slot: &StdinSlot, code: &str) -> Result<(), String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return Err("Enter the code first.".to_string());
    }
    let mut guard = slot.lock().await;
    let stdin = guard.as_mut().ok_or_else(|| {
        "No Claude sign-in is waiting for a code. Start the connect again.".to_string()
    })?;
    let payload = format!("{trimmed}\n");
    let sent = async {
        stdin.write_all(payload.as_bytes()).await?;
        stdin.flush().await
    }
    .await;
    sent.map_err(|e| format!("Could not send the code to the Claude sign-in helper: {e}"))
}

/// Tauri command: relay the code the user pasted in the sign-in dialog to the
/// in-flight login child. Errors surface as a toast in the dialog; the actual
/// outcome (exchange success/failure) still arrives via `claude-login://done`.
#[tauri::command(rename_all = "snake_case")]
pub async fn submit_claude_login_code(
    state: State<'_, ClaudeLoginState>,
    code: String,
) -> Result<(), String> {
    let slot = {
        let guard = state.0.lock().await;
        guard
            .as_ref()
            .map(|handle| handle.stdin.clone())
            .ok_or_else(|| {
                "No Claude sign-in is waiting for a code. Start the connect again.".to_string()
            })?
    };
    write_login_code(&slot, &code).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn write_login_code_rejects_blank_and_unarmed() {
        let empty: StdinSlot = Arc::new(tokio::sync::Mutex::new(None));
        assert!(write_login_code(&empty, "   ").await.is_err());
        assert!(write_login_code(&empty, "abc").await.is_err());
    }

    /// End-to-end paste path: a fake `claude` prints the visit line, waits for a
    /// code on stdin (the real CLI's `Paste code here if prompted >` behavior),
    /// and exits 0 only when the expected code arrives. Exercises the piped
    /// stdin from `build_login_command`, the stdin slot, and the write helper.
    #[cfg(unix)]
    #[tokio::test]
    async fn pasted_code_reaches_the_child_and_completes_the_login() {
        use std::os::unix::fs::PermissionsExt;
        use std::sync::atomic::AtomicBool;

        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "houston-claude-code-input-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("mkdir temp");
        let script = dir.join("claude");
        std::fs::write(
            &script,
            "#!/bin/sh\n\
             echo \"If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true\"\n\
             printf 'Paste code here if prompted > '\n\
             read code\n\
             [ \"$code\" = \"goodcode#state\" ] && exit 0\n\
             exit 1\n",
        )
        .expect("write fake claude");
        let mut perms = std::fs::metadata(&script).expect("stat").permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&script, perms).expect("chmod");

        let mut child = super::super::resolve::build_login_command(&script, &dir.join("config"))
            .spawn()
            .expect("spawn fake claude");
        let slot: StdinSlot = Arc::new(tokio::sync::Mutex::new(child.stdin.take()));

        let events = Arc::new(std::sync::Mutex::new(Vec::<(String, serde_json::Value)>::new()));
        let sink = events.clone();
        let login = tokio::spawn(super::super::runner::run_login_child(
            child,
            Arc::new(AtomicBool::new(false)),
            move |name: &str, payload: serde_json::Value| {
                sink.lock().expect("events lock").push((name.to_string(), payload));
            },
        ));

        write_login_code(&slot, "  goodcode#state  ")
            .await
            .expect("write code");
        login.await.expect("login task");

        let got = events.lock().expect("events lock");
        let done = got.last().expect("done event");
        assert_eq!(done.0, super::super::EVENT_DONE);
        assert_eq!(done.1["success"], serde_json::json!(true));

        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
