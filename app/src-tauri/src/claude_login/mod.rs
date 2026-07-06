//! Drive `claude auth login --claudeai` for the user — browser approve, zero
//! terminal.
//!
//! The installed `claude` CLI's `auth login --claudeai` is a plain readline
//! stdio flow (NOT an Ink TUI): it starts its OWN loopback, prints
//! `Opening browser to sign in…` then a line
//! `If the browser didn't open, visit: <AUTHORIZE_URL>`, auto-opens the
//! browser, catches its own callback, caches the credential, prints
//! `Login successful`, and exits 0. On failure it exits non-zero.
//!
//! We run it as a piped child so the app can (1) surface the authorize URL to
//! the webview (as a copy/paste fallback when the auto-open browser doesn't
//! fire) and (2) report success/failure back to the UI — the terminal is never
//! shown. The cached credential is SCOPED BY the `CLAUDE_CONFIG_DIR` env var, so
//! the login MUST run with that pointed at Houston's shared login dir; the
//! engine (which reads the same dir) then sees the credential.
//!
//! Two Tauri events carry the flow to the webview:
//!   * `claude-login://url`  — payload is the authorize URL `String` (emitted at
//!     most once, when the CLI prints its `visit:` line).
//!   * `claude-login://done` — payload `{ success: bool, error: string | null }`.
//!     A `null` error on `success: false` is a benign CANCEL (the frontend
//!     treats it as a silent dismissal, not a failure to toast).
//!
//! Cancel + child kill run through `ClaudeLoginState`; the background task that
//! owns the child polls a shared cancel flag and tears the child down when set.
//!
//! Split across submodules to stay under the 200-line file limit:
//!   * [`resolve`] — binary/config-dir resolution, command building, URL parse.
//!   * [`runner`] — the spawn/stream/wait state machine (`run_login_child`).

mod resolve;
mod runner;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use resolve::{build_login_command, resolve_claude_binary};
use runner::run_login_child;

/// Tauri event carrying the authorize URL to the webview (copy/paste fallback).
const EVENT_URL: &str = "claude-login://url";

/// Tauri event carrying the terminal result to the webview.
/// Payload: `{ success: bool, error: string | null }`.
const EVENT_DONE: &str = "claude-login://done";

/// Houston's shared Claude login dir, used as `CLAUDE_CONFIG_DIR` for both this
/// login AND the engine so the cached credential is visible to the engine.
fn claude_login_config_dir() -> PathBuf {
    crate::houston_dir().join("claude-login")
}

/// Managed state so `cancel_claude_login` can tear down an in-flight login.
/// Holds only the shared cancel flag — the child itself lives in the background
/// task, which polls the flag and kills the child when it flips.
#[derive(Default)]
pub struct ClaudeLoginState(pub tokio::sync::Mutex<Option<ClaudeLoginHandle>>);

/// The cancel side of one in-flight login. `start_claude_login` overwrites this
/// on each fresh attempt; a stale handle left after a completed login is benign
/// (nothing polls the flag once the task has finished).
pub struct ClaudeLoginHandle {
    cancel: Arc<AtomicBool>,
}

/// Start the native Claude sign-in. Returns `Err` (→ frontend toast) only for
/// the up-front, user-visible failures: the config dir can't be created, or the
/// helper can't be spawned. Once the child is up, the flow reports its result
/// through the `claude-login://done` event instead.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_claude_login(
    app: AppHandle,
    state: State<'_, ClaudeLoginState>,
) -> Result<(), String> {
    let config_dir = claude_login_config_dir();
    // The CLI writes the cached credential here; it must exist first.
    std::fs::create_dir_all(&config_dir).map_err(|e| {
        format!(
            "Could not prepare the Claude sign-in directory ({}): {e}",
            config_dir.display()
        )
    })?;

    let bin = resolve_claude_binary();
    // Spawn synchronously so a launch failure surfaces as a toast (Err) rather
    // than an async `done` event.
    let child = build_login_command(&bin, &config_dir)
        .spawn()
        .map_err(|e| format!("Could not start the Claude sign-in helper: {e}"))?;
    tracing::info!(
        "[claude-login] spawned {} with CLAUDE_CONFIG_DIR={}",
        bin.display(),
        config_dir.display()
    );

    // Publish the cancel flag before the task starts so a Cancel racing the
    // spawn is honored.
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.0.lock().await;
        *guard = Some(ClaudeLoginHandle {
            cancel: cancel.clone(),
        });
    }

    let app_for_task = app.clone();
    tokio::spawn(async move {
        run_login_child(child, cancel, move |name, payload| {
            // Resurface the app when the browser approve lands (mirrors the
            // OAuth loopback's snap-back).
            if name == EVENT_DONE && payload.get("success").and_then(Value::as_bool) == Some(true) {
                crate::window_focus::bring_to_front(&app_for_task);
            }
            // Emitting is fallible, but this task already outlived the command
            // that returned to the UI — there is no Result left to toast. This
            // is the documented event-callback exception to the
            // no-silent-failure rule; the frontend's retry is the safety net.
            if let Err(e) = app_for_task.emit(name, payload) {
                tracing::error!("[claude-login] failed to emit {name}: {e}");
            }
        })
        .await;
    });

    Ok(())
}

/// Cancel an in-flight login. Idempotent and benign when nothing is running
/// (no handle → no-op). Flipping the flag makes the background task's wait loop
/// kill the child and emit `claude-login://done { success: false, error: null }`
/// — a silent dismissal, not a failure.
#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_claude_login(state: State<'_, ClaudeLoginState>) -> Result<(), String> {
    let guard = state.0.lock().await;
    if let Some(handle) = guard.as_ref() {
        handle.cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_dir_lives_under_houston_home() {
        // The shared login dir hangs off the Houston data root.
        assert!(claude_login_config_dir().ends_with("claude-login"));
    }
}
