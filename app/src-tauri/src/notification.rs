//! Native "agent finished" notifications for Linux + Windows whose CLICK
//! brings Houston to the foreground and replays the pending mission nav.
//!
//! ## Why this exists (issue #289)
//!
//! Clicking the notification navigates to the mission on macOS but not on
//! Linux/Windows. The bundled `tauri-plugin-notification` is fire-and-forget
//! on *every* desktop OS — its `show()` is
//! `spawn(async move { let _ = notification.show(); })`, with no click event —
//! and the JS `onAction` listener is mobile-only. macOS works only
//! *incidentally*: the OS activates the app on a notification click, which
//! fires `WindowEvent::Focused(true)` in `lib.rs` → emits `app-activated` →
//! the frontend's `consumePendingNav()` navigates.
//!
//! Linux notification clicks don't focus the source window, and Windows toast
//! clicks don't reliably raise it, so that incidental path never fires there.
//! Here we show the notification ourselves and wire its click to the same
//! outcome: raise + focus the main window and emit `app-activated`. The
//! frontend navigation logic is unchanged — it already stashes the target in
//! `pendingNotificationNav` and consumes it on `app-activated`.

use tauri::AppHandle;

/// Show a native notification whose click raises Houston and emits
/// `app-activated`. macOS keeps using the JS notification plugin (see
/// `session-notifications.ts`) and never invokes this command.
#[tauri::command(rename_all = "snake_case")]
pub fn show_session_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        linux::show(app, title, body)
    }
    #[cfg(target_os = "windows")]
    {
        windows::show(app, title, body)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        // macOS / other: never called from the frontend. Keep the signature
        // total so `generate_handler!` compiles on every target.
        let _ = (app, title, body);
        Ok(())
    }
}

/// Raise + focus the main window and tell the frontend the app was activated.
/// Mirrors the single-instance handler in `lib.rs`; `app-activated` is what the
/// frontend listens for to consume `pendingNotificationNav`.
#[cfg(any(target_os = "linux", target_os = "windows"))]
fn activate_main_window(app: &AppHandle) {
    use tauri::{Emitter, Manager};

    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.unminimize() {
            tracing::warn!("[notification] unminimize failed: {e}");
        }
        if let Err(e) = window.show() {
            tracing::warn!("[notification] show failed: {e}");
        }
        if let Err(e) = window.set_focus() {
            tracing::warn!("[notification] set_focus failed: {e}");
        }
    }
    if let Err(e) = app.emit("app-activated", ()) {
        tracing::error!("[notification] failed to emit app-activated: {e}");
    }
}

/// The freedesktop "default" action key means the user clicked the notification
/// body (as opposed to `"__closed"`, which notify-rust reports on dismissal).
#[cfg(target_os = "linux")]
fn is_activation_action(action: &str) -> bool {
    action == "default"
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{activate_main_window, is_activation_action};
    use tauri::AppHandle;

    pub fn show(app: AppHandle, title: String, body: String) -> Result<(), String> {
        // notify-rust's `wait_for_action` runs a blocking D-Bus loop until the
        // notification is clicked or closed, so it gets its own thread. The
        // `"default"` action makes the whole notification body clickable per
        // the freedesktop spec (daemons that lack body-click render it as an
        // "Open" button instead).
        std::thread::Builder::new()
            .name("houston-notification".into())
            .spawn(move || {
                match notify_rust::Notification::new()
                    .summary(&title)
                    .body(&body)
                    .appname("Houston")
                    .action("default", "Open")
                    .show()
                {
                    Ok(handle) => handle.wait_for_action(|action| {
                        if is_activation_action(action) {
                            activate_main_window(&app);
                        }
                    }),
                    Err(e) => tracing::error!("[notification] linux notify failed: {e}"),
                }
            })
            .map_err(|e| format!("failed to spawn notification thread: {e}"))?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::activate_main_window;
    use tauri::{AppHandle, Manager};
    use tauri_winrt_notification::Toast;

    pub fn show(app: AppHandle, title: String, body: String) -> Result<(), String> {
        // Installed builds register the `com.houston.app` AUMID so the toast
        // carries Houston's icon + name; unregistered dev builds fall back to
        // the PowerShell AUMID — the same split tauri-plugin-notification uses.
        // `on_activated` fires in-process when the toast is clicked.
        let app_id = if cfg!(debug_assertions) {
            Toast::POWERSHELL_APP_ID.to_string()
        } else {
            app.config().identifier.clone()
        };
        let activate = app.clone();
        Toast::new(&app_id)
            .title(&title)
            .text1(&body)
            .on_activated(move |_arg| {
                activate_main_window(&activate);
                Ok(())
            })
            .show()
            .map_err(|e| format!("failed to show toast: {e}"))
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::is_activation_action;

    #[test]
    fn body_click_activates_but_close_does_not() {
        assert!(is_activation_action("default"));
        assert!(!is_activation_action("__closed"));
        assert!(!is_activation_action("some-button"));
    }
}
