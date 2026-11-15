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
    Registered,
    /// A command could not be spawned. The desktop file is already written,
    /// so running `xdg-mime default` ourselves finishes the job.
    RunXdgMime,
    Failed,
}

/// Where registration ended up after our own `xdg-mime default` attempt.
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

/// The plugin names its desktop file after the running executable.
pub fn desktop_file_name(exe: &Path) -> Option<String> {
    exe.file_name()
        .map(|name| format!("{}-handler.desktop", name.to_string_lossy()))
}

#[cfg(target_os = "linux")]
pub fn register<R: tauri::Runtime, M: tauri::Manager<R>>(app: &M) {
    use tauri_plugin_deep_link::DeepLinkExt;
    for scheme in SCHEMES {
        let plugin = app.deep_link().register(scheme);
        match after_plugin(&plugin) {
            AfterPlugin::Registered => {}
            AfterPlugin::Failed => warn_unregistered(scheme, &format!("{plugin:?}")),
            AfterPlugin::RunXdgMime => {
                let xdg = run_xdg_mime(scheme);
                match after_xdg_mime(&xdg) {
                    AfterXdgMime::Registered => tracing::info!(
                        "[deep-link] {scheme}:// registered with xdg-mime after the plugin stopped: {plugin:?}"
                    ),
                    AfterXdgMime::XdgMimeMissing => report_xdg_mime_missing(scheme),
                    AfterXdgMime::Failed => {
                        warn_unregistered(scheme, &format!("plugin {plugin:?}, xdg-mime {xdg:?}"))
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn run_xdg_mime(scheme: &str) -> std::io::Result<bool> {
    let exe = tauri::utils::platform::current_exe()?;
    let file_name = desktop_file_name(&exe).ok_or_else(|| {
        std::io::Error::new(ErrorKind::InvalidInput, "executable path has no file name")
    })?;
    let mut cmd = std::process::Command::new("xdg-mime");
    cmd.args(["default", &file_name, &format!("x-scheme-handler/{scheme}")]);
    // xdg-mime lives outside the bundle; the AppImage's library paths break it.
    crate::appimage_env::sanitize_std_command(&mut cmd);
    cmd.status().map(|status| status.success())
}

#[cfg(target_os = "linux")]
fn warn_unregistered(scheme: &str, detail: &str) {
    tracing::warn!(
        "[deep-link] runtime {scheme}:// registration failed; Apple sign-in won't reach this install: {detail}"
    );
}

/// A warning, not an error: nothing in Houston broke, but the count of
/// machines that cannot sign in by redirect is worth seeing. One fingerprint
/// so every launch on every such machine lands in one issue.
#[cfg(target_os = "linux")]
fn report_xdg_mime_missing(scheme: &str) {
    tracing::warn!("[deep-link] xdg-mime is not installed; {scheme}:// sign-in redirects can't reach this install");
    sentry::with_scope(
        |scope| {
            scope.set_tag("source", "deep_link_register");
            scope.set_fingerprint(Some(&["deep-link-xdg-mime-missing"][..]));
        },
        || {
            sentry::capture_message(
                "xdg-mime is not installed; houston:// sign-in redirects can't reach this install",
                sentry::Level::Warning,
            );
        },
    );
}

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
