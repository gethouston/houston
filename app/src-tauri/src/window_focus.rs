//! Bring Houston's main window — and, on macOS, the whole app — to the
//! foreground.
//!
//! Used wherever a flow finishes in the user's system browser and we want the
//! app to surface itself instead of leaving the user to hunt for it. This is
//! the "stranded after sign-in" problem generalized to every return-to-app
//! moment: the Google OAuth loopback success, the `houston://` deep links, OS
//! resume, and a Composio integration connection landing.

use tauri::{AppHandle, Manager};

/// Raise the main window to the front. Dispatches to the main thread because
/// macOS app-activation must run there (and window show/focus is safe there
/// too). Best-effort: focus is a UX nicety with no user action to surface an
/// error against, so failures are logged, not toasted.
pub fn bring_to_front(app: &AppHandle) {
    let handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        // macOS: makeKeyAndOrderFront (what set_focus calls) does NOT pull the
        // app in front of the browser when activation is triggered
        // programmatically — the user never clicked a Houston window. Activate
        // the NSApplication so the window actually surfaces over the browser
        // the user just finished signing in / connecting in.
        #[cfg(target_os = "macos")]
        {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;
            if let Some(mtm) = MainThreadMarker::new() {
                let ns_app = NSApplication::sharedApplication(mtm);
                #[allow(deprecated)]
                ns_app.activateIgnoringOtherApps(true);
            }
        }
    }) {
        tracing::warn!("[focus] run_on_main_thread failed: {e}");
    }
}

/// Frontend-invokable focus. Called when a server-side event (e.g. a Composio
/// connection landing) means the user should be pulled back into the app from
/// their browser, mirroring the snap-back the OAuth loopback already does.
#[tauri::command(rename_all = "snake_case")]
pub fn focus_main_window(app: AppHandle) {
    bring_to_front(&app);
}
