//! The Tauri-facing half of the guard: detect a dead main window at
//! `RunEvent::Ready`, relaunch once, then report, show the remedy and exit.

use super::{
    classify, decide, dialog_body, parse_hresult, probe_writable, recorded_failure, Decision,
    Report, DIALOG_TITLE, FORCE_FAIL_ENV, RELAUNCHED_ENV,
};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// A runtime mid-update at logon needs a moment before the relaunch.
const RELAUNCH_DELAY: Duration = Duration::from_millis(1500);

/// The main window exists in the manager either way; only a window whose
/// native side was created answers a getter. `is_visible` is the cheapest.
fn main_webview_alive(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|window| window.is_visible().is_ok())
        .unwrap_or(false)
}

fn forced_failure() -> bool {
    cfg!(debug_assertions) && std::env::var_os(FORCE_FAIL_ENV).is_some()
}

/// Call at `RunEvent::Ready`. Returns when `main` is alive; otherwise never
/// returns control to a session that would idle with no window.
pub fn ensure_main_webview(app: &AppHandle) {
    if main_webview_alive(app) && !forced_failure() {
        return;
    }
    let already_relaunched = std::env::var_os(RELAUNCHED_ENV).is_some();
    match decide(already_relaunched) {
        Decision::Relaunch => relaunch(app),
        Decision::FailClosed => fail_closed(app),
    }
}

fn shut_down_sidecars(app: &AppHandle) {
    crate::engine_supervisor::mark_shutting_down();
    crate::local_bridge::shutdown();
    // Release the single-instance mutex now: the child must not be routed
    // back to this dying process as a secondary launch.
    tauri_plugin_single_instance::destroy(app);
}

fn relaunch(app: &AppHandle) -> ! {
    tracing::warn!(
        runtime_error = recorded_failure()
            .as_deref()
            .unwrap_or("(no runtime error logged)"),
        "[webview-guard] main window has no webview; relaunching once"
    );
    std::thread::sleep(RELAUNCH_DELAY);
    std::env::set_var(RELAUNCHED_ENV, "1");
    shut_down_sidecars(app);
    app.restart()
}

fn gather(app: &AppHandle) -> Report {
    let message = recorded_failure();
    let hresult = message.as_deref().and_then(parse_hresult);
    let data_dir = app.path().app_local_data_dir().ok();
    let data_dir_writable = data_dir.as_deref().map(|dir| probe_writable(dir).is_ok());
    Report {
        message,
        hresult,
        runtime_version: tauri::webview_version().ok(),
        data_dir,
        data_dir_writable,
    }
}

/// Report the persistent failure (the ERROR record becomes the Sentry event
/// that carries the HRESULT, runtime version and data folder), flush it so
/// the exit does not drop it, tell the user, and exit cleanly.
fn fail_closed(app: &AppHandle) -> ! {
    let report = gather(app);
    let cause = classify(&report);
    tracing::error!(
        cause = ?cause,
        hresult = report.hresult.map(|code| format!("0x{code:08X}")),
        runtime_error = report.message.as_deref(),
        webview2_version = report.runtime_version.as_deref(),
        user_data_dir = report.data_dir.as_deref().map(|dir| dir.display().to_string()),
        user_data_dir_writable = report.data_dir_writable,
        "[webview-guard] WebView2 cannot back Houston's window after a relaunch; exiting"
    );
    if let Some(client) = sentry::Hub::current().client() {
        client.flush(Some(Duration::from_secs(3)));
    }
    crate::window_preflight::win::show_dialog(DIALOG_TITLE, &dialog_body(cause, &report));
    shut_down_sidecars(app);
    app.cleanup_before_exit();
    std::process::exit(0)
}
