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
//! Here we show the notification ourselves and wire its click to raise + focus
//! the main window and emit a distinct `notification-clicked` event. The
//! frontend stashes the nav target in `pendingNotificationNav` and consumes it
//! on `notification-clicked` — NOT on the generic `app-activated`, which also
//! fires on any alt-tab / dock click / resume and would otherwise yank the user
//! to a finished mission whenever they refocus Houston.

use tauri::AppHandle;

/// Show a native notification whose click raises Houston and emits
/// `notification-clicked`. macOS keeps using the JS notification plugin (see
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

/// Raise + focus the main window in response to a real notification click, then
/// signal that click to the frontend. We emit `notification-clicked` rather than
/// the generic `app-activated`: the latter also fires on any alt-tab / dock
/// click / resume (see `lib.rs`), and nav to the finished mission must happen
/// only on a genuine click, never on an incidental refocus. The window-raise
/// still triggers `WindowEvent::Focused(true)` -> `app-activated`, which is what
/// refreshes the agent list. See `use-session-events.ts`.
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
    tracing::info!("[notification] click → emitting notification-clicked");
    // The click callback runs on a platform notification thread (the WinRT toast
    // callback / notify-rust's D-Bus loop). Marshal the emit onto the main
    // thread so the event reliably reaches the webview regardless of that
    // thread's context.
    let emitter = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        if let Err(e) = emitter.emit("notification-clicked", ()) {
            tracing::error!("[notification] failed to emit notification-clicked: {e}");
        }
    }) {
        tracing::error!("[notification] run_on_main_thread failed: {e}");
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
                    // Match macOS's "Glass" ping: the freedesktop default
                    // "message" sound so a finished mission is audible, not
                    // silent. Daemons without the theme sound just stay quiet.
                    .sound_name("message-new-instant")
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
    use tauri::AppHandle;
    use tauri_winrt_notification::{Sound, Toast};

    /// Pick the toast's Application User Model ID. Installed builds register the
    /// `com.houston.app` AUMID so the toast carries Houston's icon + name;
    /// unregistered dev builds fall back to the PowerShell AUMID — the same
    /// split tauri-plugin-notification uses.
    fn resolve_toast_app_id(debug: bool, identifier: &str) -> String {
        if debug {
            Toast::POWERSHELL_APP_ID.to_string()
        } else {
            identifier.to_string()
        }
    }

    pub fn show(app: AppHandle, title: String, body: String) -> Result<(), String> {
        // `on_activated` fires in-process when the toast is clicked.
        let app_id = resolve_toast_app_id(cfg!(debug_assertions), &app.config().identifier);
        tracing::info!("[notification] showing Windows toast (app_id={app_id})");
        let activate = app.clone();
        Toast::new(&app_id)
            .title(&title)
            .text1(&body)
            // Match macOS's "Glass" ping: the platform default toast sound so a
            // finished mission is audible, not silent.
            .sound(Some(Sound::Default))
            .on_activated(move |_arg| {
                activate_main_window(&activate);
                Ok(())
            })
            .show()
            .map_err(|e| format!("failed to show toast: {e}"))
    }

    #[cfg(test)]
    mod tests {
        use super::resolve_toast_app_id;
        use tauri_winrt_notification::Toast;

        #[test]
        fn release_uses_app_identifier_and_dev_uses_powershell() {
            // Release: the toast must carry Houston's registered AUMID so the
            // OS shows our icon/name and routes the click back to us.
            assert_eq!(
                resolve_toast_app_id(false, "com.houston.app").as_str(),
                "com.houston.app",
            );
            // Dev: no AUMID is registered, so fall back to PowerShell's.
            assert_eq!(
                resolve_toast_app_id(true, "com.houston.app").as_str(),
                Toast::POWERSHELL_APP_ID,
            );
        }
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
