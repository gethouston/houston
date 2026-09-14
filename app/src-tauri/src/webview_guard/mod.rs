//! Turn a main window with no WebView2 behind it into one relaunch, then a
//! Sentry event that names the cause and a dialog the user can act on
//! (PRODUCT-1779).
//!
//! When `CreateCoreWebView2Environment` or the controller creation fails
//! (Sentry HOUSTON-APP-17: `E_INVALIDARG`, every machine on Windows 11 build
//! 26200), tauri-runtime-wry logs the error and returns `Ok`: the manager
//! still registers `main`, every getter on it fails with a dropped channel,
//! `setup` runs to completion and nothing ever appears. The user clicks the
//! icon and gets nothing, no dialog, no retry, and the event carries only
//! the HRESULT.
//!
//! [`enforce::ensure_main_webview`] runs at `RunEvent::Ready`, once every
//! config window has been attempted. A main window that cannot answer a
//! getter is dead. The first time, the process relaunches itself (a runtime
//! mid-update at logon recovers). The second time, it reports the HRESULT
//! captured from the runtime's own log line, the WebView2 runtime version,
//! the user data folder and whether it is writable, shows the remedy, and
//! exits cleanly.
//!
//! Decision logic is pure and unit-tested on every host; the Tauri and Win32
//! calls live in `enforce`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tracing::{Event, Subscriber};
use tracing_log::NormalizeEvent;
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

#[cfg(target_os = "windows")]
pub mod enforce;

/// Set on the relaunched child so a broken runtime never relaunches forever.
pub const RELAUNCHED_ENV: &str = "HOUSTON_WEBVIEW_RELAUNCHED";

/// Debug builds honour `HOUSTON_FORCE_WEBVIEW_FAIL=1` so the relaunch, report
/// and dialog path can be exercised with `pnpm tauri dev` on a healthy
/// machine (the window preflight's pattern). Release builds ignore it.
pub const FORCE_FAIL_ENV: &str = "HOUSTON_FORCE_WEBVIEW_FAIL";

/// The runtime's log target and message prefix for a failed webview, from
/// `tauri-runtime-wry`'s `Message::CreateWindow` error arm.
const RUNTIME_TARGET: &str = "tauri_runtime_wry";
const FAILURE_PREFIX: &str = "failed to create webview";

/// Everything known about the failure, gathered for the event and the copy.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Report {
    /// The runtime's own log line, HRESULT included.
    pub message: Option<String>,
    pub hresult: Option<u32>,
    /// `None` when `GetAvailableCoreWebView2BrowserVersionString` fails:
    /// no Evergreen runtime is registered at all.
    pub runtime_version: Option<String>,
    pub data_dir: Option<PathBuf>,
    pub data_dir_writable: Option<bool>,
}

/// What the evidence points at; drives the dialog copy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cause {
    RuntimeMissing,
    DataFolderUnwritable,
    RuntimeBroken,
}

/// What to do with a dead main window on this launch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Relaunch,
    FailClosed,
}

pub fn decide(already_relaunched: bool) -> Decision {
    if already_relaunched {
        Decision::FailClosed
    } else {
        Decision::Relaunch
    }
}

/// `WindowsError(Error { code: HRESULT(0x80070057), ... })` -> `0x80070057`.
pub fn parse_hresult(message: &str) -> Option<u32> {
    let start = message.find("HRESULT(0x")? + "HRESULT(0x".len();
    let hex: String = message[start..]
        .chars()
        .take_while(char::is_ascii_hexdigit)
        .collect();
    u32::from_str_radix(&hex, 16).ok()
}

pub fn classify(report: &Report) -> Cause {
    if report.runtime_version.is_none() {
        Cause::RuntimeMissing
    } else if report.data_dir_writable == Some(false) {
        Cause::DataFolderUnwritable
    } else {
        Cause::RuntimeBroken
    }
}

pub const DIALOG_TITLE: &str = "Houston can't open";

/// Plain-language dialog body. The HRESULT is the one technical detail
/// kept, so support can match a report to the Sentry event.
pub fn dialog_body(cause: Cause, report: &Report) -> String {
    let code = report
        .hresult
        .map(|code| format!("error 0x{code:08X}"))
        .unwrap_or_else(|| "an unknown error".to_string());
    match cause {
        Cause::RuntimeMissing => format!(
            "Houston needs the Microsoft Edge WebView2 Runtime, and Windows reports it isn't \
             installed.\n\n\
             Install it from Microsoft's website (search for \"WebView2 Runtime\"), \
             then open Houston again.\n\n({code})"
        ),
        Cause::DataFolderUnwritable => format!(
            "Houston can't write to its data folder, so its window can't start:\n{}\n\n\
             Make sure you can create files there (a locked-down or redirected profile \
             usually causes this), then open Houston again. If you can't, contact support \
             and mention {code}.",
            report
                .data_dir
                .as_deref()
                .map(Path::display)
                .map(|path| path.to_string())
                .unwrap_or_else(|| "(unknown)".to_string())
        ),
        Cause::RuntimeBroken => format!(
            "The Microsoft Edge WebView2 Runtime on this computer isn't working, so Houston \
             can't start right now.\n\n\
             Repair it: open Windows Settings > Apps > Installed apps, find \
             \"Microsoft Edge WebView2 Runtime\", choose Modify, then Repair. Then open \
             Houston again. If this keeps happening, contact support and mention {code}."
        ),
    }
}

/// Can this process create a file in `dir`? Runs against the folder WebView2
/// keeps its profile under; the probe file is removed on every path.
pub fn probe_writable(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(format!(".houston-webview-probe-{}", std::process::id()));
    std::fs::write(&probe, b"1")?;
    std::fs::remove_file(&probe)
}

/// The runtime's own error line, not the many other ERROR records it emits.
pub fn is_webview_creation_error(target: &str, message: &str) -> bool {
    target.starts_with(RUNTIME_TARGET) && message.starts_with(FAILURE_PREFIX)
}

static RECORDED: Mutex<Option<String>> = Mutex::new(None);

/// The last webview creation failure the runtime logged, HRESULT included.
pub fn recorded_failure() -> Option<String> {
    RECORDED.lock().ok().and_then(|slot| slot.clone())
}

/// Tracing layer that keeps the runtime's webview creation error. The
/// runtime swallows the `Result`, so the log line is the only place the
/// HRESULT ever appears; this hands it to the event that names the cause.
pub struct FailureRecorder;

impl<S: Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>> Layer<S>
    for FailureRecorder
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let normalized = event.normalized_metadata();
        let metadata = normalized.as_ref().unwrap_or_else(|| event.metadata());
        if *metadata.level() != tracing::Level::ERROR
            || !metadata.target().starts_with(RUNTIME_TARGET)
        {
            return;
        }
        let message = crate::sentry_filter::message_of(event);
        if is_webview_creation_error(metadata.target(), &message) {
            if let Ok(mut slot) = RECORDED.lock() {
                *slot = Some(message);
            }
        }
    }
}

#[cfg(test)]
mod tests;
