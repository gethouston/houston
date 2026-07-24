//! Open the OS notification-settings pane so a user whose OS blocked Houston's
//! completion notifications can grant them.
//!
//! macOS and Windows each expose a settings deep link the default handler
//! opens; Linux has no single, desktop-agnostic notification-settings URI, so
//! it returns an error the frontend reads as "unsupported" and hides the
//! button (see `os-bridge.ts` / the Settings notifications row).

/// Open the platform notification-settings pane. Returns `Ok(true)` when a pane
/// was launched; `Err` on Linux (unsupported) and on a genuine launch failure,
/// so the frontend surfaces the failure instead of swallowing it.
#[tauri::command(rename_all = "snake_case")]
pub fn open_notification_settings() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.notifications")
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open notification settings: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        // `start` resolves the `ms-settings:` URI via the default handler. It
        // needs a shell, and the URI carries no metacharacters, so `cmd /C
        // start` is safe here (unlike the OAuth URLs in commands/os.rs).
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:notifications"])
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open notification settings: {e}"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("notification settings pane is unsupported on this platform".into())
    }
}

// The macOS/Windows arms spawn a real settings pane, so they aren't unit-tested
// (a test with that side effect would pop System Settings open on every run);
// they're exercised through the Settings row. Only the pure Linux contract —
// "report unsupported so the frontend hides the button" — is asserted here.
#[cfg(all(test, not(any(target_os = "macos", target_os = "windows"))))]
mod tests {
    use super::open_notification_settings;

    #[test]
    fn linux_reports_unsupported() {
        assert!(open_notification_settings().is_err());
    }
}
