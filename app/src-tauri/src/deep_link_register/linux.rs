use std::process::Command;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

use super::{
    after_plugin, after_query, after_xdg_mime, desktop_file_name, mimeapps_default, AfterPlugin,
    AfterXdgMime, SCHEMES,
};

enum Unregistered {
    XdgMimeMissing,
    Failed(String),
}

/// Runs on its own thread: the `xdg-mime` calls are shell scripts that take
/// tens of milliseconds each, and nothing in setup waits on the result.
pub fn register<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("deep-link-register".into())
        .spawn(move || {
            for scheme in SCHEMES {
                match register_scheme(&app, scheme) {
                    Ok(()) => {}
                    Err(Unregistered::XdgMimeMissing) => report_xdg_mime_missing(scheme),
                    Err(Unregistered::Failed(detail)) => report_failed(scheme, &detail),
                }
            }
        });
    if let Err(e) = spawned {
        report_failed(
            &SCHEMES.join(","),
            &format!("could not start the thread: {e}"),
        );
    }
}

fn register_scheme<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    scheme: &str,
) -> Result<(), Unregistered> {
    let plugin = app.deep_link().register(scheme);
    let next = after_plugin(&plugin);
    if next == AfterPlugin::Failed {
        return Err(Unregistered::Failed(format!("plugin {plugin:?}")));
    }
    let exe = tauri::utils::platform::current_exe()
        .map_err(|e| Unregistered::Failed(format!("plugin {plugin:?}, current exe: {e}")))?;
    let file_name = desktop_file_name(&exe)
        .ok_or_else(|| Unregistered::Failed(format!("executable path {exe:?} has no file name")))?;

    let mut ran_default = false;
    if next == AfterPlugin::RunXdgMime {
        // Same location the plugin writes to. A missing file means the plugin
        // stopped before writing it, and xdg-mime would point at nothing.
        let desktop_file = app
            .path()
            .data_dir()
            .map_err(|e| Unregistered::Failed(format!("plugin {plugin:?}, data dir: {e}")))?
            .join("applications")
            .join(&file_name);
        if !desktop_file.is_file() {
            return Err(Unregistered::Failed(format!(
                "plugin {plugin:?}, {} was not written",
                desktop_file.display()
            )));
        }
        let xdg = set_default(scheme, &file_name);
        match after_xdg_mime(&xdg) {
            AfterXdgMime::Registered => ran_default = true,
            AfterXdgMime::XdgMimeMissing => return Err(Unregistered::XdgMimeMissing),
            AfterXdgMime::Failed => {
                return Err(Unregistered::Failed(format!(
                    "plugin {plugin:?}, xdg-mime default {xdg:?}"
                )))
            }
        }
    }

    let (outcome, handler) = current_handler(scheme, &file_name);
    match outcome {
        AfterXdgMime::Registered => {
            if ran_default {
                tracing::info!(
                    "[deep-link] {scheme}:// registered with xdg-mime after the plugin stopped: {plugin:?}"
                );
            }
            return Ok(());
        }
        AfterXdgMime::XdgMimeMissing => return Err(Unregistered::XdgMimeMissing),
        AfterXdgMime::Failed if ran_default => {
            return Err(Unregistered::Failed(format!(
                "xdg-mime default ran, handler is still {handler}"
            )))
        }
        AfterXdgMime::Failed => {}
    }

    // The plugin returned Ok, but it ignores exit statuses and the handler is
    // not ours. One retry of the step that sets it.
    let xdg = set_default(scheme, &file_name);
    let (outcome, retried) = current_handler(scheme, &file_name);
    match outcome {
        AfterXdgMime::Registered => {
            tracing::info!(
                "[deep-link] {scheme}:// set with xdg-mime; the plugin left the handler at {handler}"
            );
            Ok(())
        }
        AfterXdgMime::XdgMimeMissing => Err(Unregistered::XdgMimeMissing),
        AfterXdgMime::Failed => Err(Unregistered::Failed(format!(
            "plugin left the handler at {handler}; xdg-mime default {xdg:?}, handler now {retried}"
        ))),
    }
}

fn xdg_mime() -> Command {
    let mut cmd = Command::new("xdg-mime");
    // xdg-mime lives outside the bundle; the AppImage's library paths break it.
    crate::appimage_env::sanitize_std_command(&mut cmd);
    cmd
}

fn set_default(scheme: &str, file_name: &str) -> std::io::Result<bool> {
    xdg_mime()
        .args(["default", file_name, &format!("x-scheme-handler/{scheme}")])
        .status()
        .map(|status| status.success())
}

/// The outcome, and both answers for a report.
fn current_handler(scheme: &str, file_name: &str) -> (AfterXdgMime, String) {
    let queried = query_default(scheme);
    let listed = listed_default(scheme);
    let listed_name = listed.as_ref().ok().and_then(|l| l.as_deref());
    let outcome = after_query(&queried, listed_name, file_name);
    (
        outcome,
        format!("query {queried:?}, mimeapps.list {listed:?}"),
    )
}

/// `dirs::config_dir()` honours `$XDG_CONFIG_HOME`, as xdg-mime does.
fn listed_default(scheme: &str) -> std::io::Result<Option<String>> {
    let dir = dirs::config_dir().ok_or_else(|| std::io::Error::other("no config dir"))?;
    mimeapps_default(
        &dir.join("mimeapps.list"),
        &format!("x-scheme-handler/{scheme}"),
    )
}

fn query_default(scheme: &str) -> std::io::Result<String> {
    xdg_mime()
        .args(["query", "default", &format!("x-scheme-handler/{scheme}")])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Both reports are warnings, not errors: nothing in Houston broke, but the
/// count of machines that cannot sign in by redirect is worth seeing. One
/// fingerprint each, so every launch on every such machine lands in one issue.
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

fn report_failed(scheme: &str, detail: &str) {
    tracing::warn!(
        "[deep-link] runtime {scheme}:// registration failed; Apple sign-in won't reach this install: {detail}"
    );
    sentry::with_scope(
        |scope| {
            scope.set_tag("source", "deep_link_register");
            scope.set_fingerprint(Some(&["deep-link-register-failed"][..]));
            scope.set_extra("scheme", scheme.into());
            scope.set_extra("detail", detail.into());
        },
        || {
            sentry::capture_message(
                "houston:// registration failed; sign-in redirects can't reach this install",
                sentry::Level::Warning,
            );
        },
    );
}
