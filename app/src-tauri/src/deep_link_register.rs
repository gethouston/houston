//! Linux `houston://` registration that still completes when
//! `update-desktop-database` is missing.
//!
//! tauri-plugin-deep-link 2.4.7's Linux `register(scheme)` writes
//! `~/.local/share/applications/<exe>-handler.desktop`, runs
//! `update-desktop-database` (which only refreshes a cache), then runs
//! `xdg-mime default <exe>-handler.desktop x-scheme-handler/<scheme>` (which is
//! what makes the file the handler). It returns at the first command it cannot
//! spawn, so on a desktop without desktop-file-utils the handler is never set
//! and sign-in redirects (Apple) never reach this install. When the plugin
//! fails that way, this module runs the `xdg-mime default` step itself.
//!
//! The plugin also ignores both commands' exit statuses, so its `Ok(())` does
//! not prove the handler is set. Every path ends by asking
//! `xdg-mime query default`, and a machine that still does not name our
//! desktop file is reported, so it stays countable.

// The runtime entry point is Linux-only; the decision logic stays compiled
// everywhere so its unit tests run on every CI platform.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::io::ErrorKind;
use std::path::Path;

/// Must match `plugins.deep-link.desktop.schemes` in `tauri.conf.json`
/// (pinned by a test). Registered one at a time so a failure on one scheme
/// still writes the desktop entry for the next.
pub const SCHEMES: &[&str] = &["houston"];

/// What to do after the plugin's `register(scheme)` returned.
#[derive(Debug, PartialEq, Eq)]
pub enum AfterPlugin {
    /// Both commands spawned. Their exit statuses are unchecked, so this
    /// still needs the query.
    Registered,
    /// A command could not be spawned. The desktop file is already written,
    /// so running `xdg-mime default` ourselves finishes the job.
    RunXdgMime,
    Failed,
}

/// Where registration ended up after an `xdg-mime` run: our own
/// `xdg-mime default`, or the `xdg-mime query default` check.
#[derive(Debug, PartialEq, Eq)]
pub enum AfterXdgMime {
    Registered,
    /// xdg-utils is not installed: no redirect sign-in on this machine.
    XdgMimeMissing,
    Failed,
}

pub fn after_plugin(result: &Result<(), tauri_plugin_deep_link::Error>) -> AfterPlugin {
    match result {
        Ok(()) => AfterPlugin::Registered,
        Err(tauri_plugin_deep_link::Error::Io(e)) if e.kind() == ErrorKind::NotFound => {
            AfterPlugin::RunXdgMime
        }
        Err(_) => AfterPlugin::Failed,
    }
}

/// `result` is the spawn result of `xdg-mime`, mapped to its exit success.
pub fn after_xdg_mime(result: &std::io::Result<bool>) -> AfterXdgMime {
    match result {
        Ok(true) => AfterXdgMime::Registered,
        Err(e) if e.kind() == ErrorKind::NotFound => AfterXdgMime::XdgMimeMissing,
        Ok(false) | Err(_) => AfterXdgMime::Failed,
    }
}

/// `stdout` is what `xdg-mime query default x-scheme-handler/<scheme>`
/// printed. Its exit status is ignored: a non-zero exit prints no handler.
pub fn after_query(stdout: &std::io::Result<String>, file_name: &str) -> AfterXdgMime {
    match stdout {
        Ok(handler) if handler.trim() == file_name => AfterXdgMime::Registered,
        Err(e) if e.kind() == ErrorKind::NotFound => AfterXdgMime::XdgMimeMissing,
        Ok(_) | Err(_) => AfterXdgMime::Failed,
    }
}

/// The plugin names its desktop file after the running executable.
pub fn desktop_file_name(exe: &Path) -> Option<String> {
    exe.file_name()
        .map(|name| format!("{}-handler.desktop", name.to_string_lossy()))
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::register;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    fn missing() -> io::Error {
        io::Error::new(ErrorKind::NotFound, "No such file or directory")
    }

    #[test]
    fn plugin_success_needs_nothing_more() {
        assert_eq!(after_plugin(&Ok(())), AfterPlugin::Registered);
    }

    #[test]
    fn missing_os_command_falls_back_to_xdg_mime() {
        let result = Err(tauri_plugin_deep_link::Error::Io(missing()));
        assert_eq!(after_plugin(&result), AfterPlugin::RunXdgMime);
    }

    #[test]
    fn other_plugin_failures_are_not_retried() {
        let denied = io::Error::new(ErrorKind::PermissionDenied, "read-only home");
        let result = Err(tauri_plugin_deep_link::Error::Io(denied));
        assert_eq!(after_plugin(&result), AfterPlugin::Failed);
        let unsupported = Err(tauri_plugin_deep_link::Error::UnsupportedPlatform);
        assert_eq!(after_plugin(&unsupported), AfterPlugin::Failed);
    }

    #[test]
    fn xdg_mime_outcomes() {
        assert_eq!(after_xdg_mime(&Ok(true)), AfterXdgMime::Registered);
        assert_eq!(
            after_xdg_mime(&Err(missing())),
            AfterXdgMime::XdgMimeMissing
        );
        assert_eq!(after_xdg_mime(&Ok(false)), AfterXdgMime::Failed);
        let denied = io::Error::new(ErrorKind::PermissionDenied, "noexec");
        assert_eq!(after_xdg_mime(&Err(denied)), AfterXdgMime::Failed);
    }

    #[test]
    fn a_command_that_is_not_installed_reads_as_xdg_mime_missing() {
        // Pins std's spawn-error kind, which the whole fallback keys on.
        let status = std::process::Command::new("houston-definitely-missing").status();
        assert_eq!(
            after_xdg_mime(&status.map(|s| s.success())),
            AfterXdgMime::XdgMimeMissing
        );
        let output = std::process::Command::new("houston-definitely-missing").output();
        let stdout = output.map(|o| String::from_utf8_lossy(&o.stdout).into_owned());
        assert_eq!(
            after_query(&stdout, "houston-app-handler.desktop"),
            AfterXdgMime::XdgMimeMissing
        );
    }

    #[test]
    fn query_accepts_only_our_desktop_file() {
        let ours = "houston-app-handler.desktop";
        let query = |stdout: &str| after_query(&Ok(stdout.to_string()), ours);
        assert_eq!(
            query("houston-app-handler.desktop\n"),
            AfterXdgMime::Registered
        );
        // A stale handler from another build, another app, or none at all.
        assert_eq!(
            query("houston-app-old-handler.desktop\n"),
            AfterXdgMime::Failed
        );
        assert_eq!(query("firefox.desktop\n"), AfterXdgMime::Failed);
        assert_eq!(query(""), AfterXdgMime::Failed);
        let denied = io::Error::new(ErrorKind::PermissionDenied, "noexec");
        assert_eq!(after_query(&Err(denied), ours), AfterXdgMime::Failed);
    }

    #[test]
    fn desktop_file_matches_the_plugin_naming() {
        assert_eq!(
            desktop_file_name(Path::new("/tmp/.mount_HoustXY/usr/bin/houston-app")).as_deref(),
            Some("houston-app-handler.desktop")
        );
        assert_eq!(desktop_file_name(Path::new("/")), None);
    }

    #[test]
    fn schemes_match_tauri_conf() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let configured: Vec<&str> = conf["plugins"]["deep-link"]["desktop"]["schemes"]
            .as_array()
            .expect("deep-link schemes")
            .iter()
            .map(|s| s.as_str().expect("scheme string"))
            .collect();
        assert_eq!(configured, SCHEMES);
    }
}
