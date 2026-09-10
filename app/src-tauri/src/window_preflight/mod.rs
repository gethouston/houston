//! Refuse to reach tao's start-up assert when Windows cannot create a
//! window (PRODUCT-1726).
//!
//! tao's `EventLoop::new` registers a window class, creates a hidden
//! message-target window and attaches a comctl32 subclass to it, then
//! `assert!`s on the subclass result. On a machine where any of those calls
//! fails, the process dies with `assertion failed: subclass_result.as_bool()`
//! before a single window exists: the user clicks the icon, nothing appears,
//! and the only trace is a panic that carries no Win32 error code (Sentry
//! HOUSTON-APP-4RG: two machines, every event a retry of the one before).
//! Nothing Houston does precedes that call, so the shell cannot repair the
//! session; it can stop short of the assert. This module runs the same three
//! calls on a throwaway window first. A failure is retried briefly (a session
//! still settling after logon or an update-launched relaunch recovers), then
//! reported with the failing call and `GetLastError` so the next event names
//! the cause, shown to the user as a plain-language dialog with the remedy
//! that covers every known cause (close apps or restart), and the process
//! exits cleanly.
//!
//! Decision logic is pure and unit-tested on every host; only the Win32
//! calls are `cfg(windows)`.

use std::time::Duration;

/// Which of tao's three start-up calls the probe could not complete.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    RegisterClass,
    CreateWindow,
    Subclass,
}

impl Step {
    /// The Win32 entry point, as it reads in Microsoft's documentation, for
    /// the log line and the support hint in the dialog.
    pub fn win32_call(self) -> &'static str {
        match self {
            Step::RegisterClass => "RegisterClassExW",
            Step::CreateWindow => "CreateWindowExW",
            Step::Subclass => "SetWindowSubclass",
        }
    }
}

/// One failed probe: the step and the `GetLastError` it left behind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Failure {
    pub step: Step,
    pub code: u32,
}

/// Pause before each retry. Five attempts over roughly 2.5 seconds: long
/// enough for a settling session, short enough that a user whose session is
/// truly out of resources sees the dialog rather than a hung launch.
const RETRY_DELAYS_MS: [u64; 4] = [200, 400, 800, 1200];

/// How long to wait before the next attempt after `failed_attempts`
/// failures, `None` once the attempts are used up.
fn retry_delay(failed_attempts: usize) -> Option<Duration> {
    failed_attempts
        .checked_sub(1)
        .and_then(|i| RETRY_DELAYS_MS.get(i))
        .map(|ms| Duration::from_millis(*ms))
}

/// `ERROR_NOT_ENOUGH_MEMORY`, `ERROR_OUTOFMEMORY`, `ERROR_NO_SYSTEM_RESOURCES`:
/// the session's desktop heap or atom table is full, which only closing apps
/// or a restart clears.
fn is_resource_exhaustion(code: u32) -> bool {
    matches!(code, 8 | 14 | 1450)
}

const DIALOG_TITLE: &str = "Houston can't open";

/// Debug builds honour `HOUSTON_FORCE_WINDOW_PREFLIGHT_FAIL=<win32 code>` so
/// the report and dialog path can be exercised with `pnpm tauri dev` on a
/// healthy machine (the DMG guard's pattern). Release builds ignore it.
const FORCE_FAIL_ENV: &str = "HOUSTON_FORCE_WINDOW_PREFLIGHT_FAIL";

fn forced_failure(raw: Option<&str>) -> Option<Failure> {
    let code = raw?.trim().parse().ok()?;
    Some(Failure {
        step: Step::CreateWindow,
        code,
    })
}

/// Plain-language dialog body. The error code and call are the one technical
/// detail kept, so support can match a report to the Sentry event.
fn dialog_body(failure: &Failure) -> String {
    let detail = format!("error {} in {}", failure.code, failure.step.win32_call());
    if is_resource_exhaustion(failure.code) {
        format!(
            "Windows has run out of the resources it needs to open a new window, \
             so Houston can't start right now.\n\n\
             Close a few apps or restart your computer, then open Houston again.\n\n\
             ({detail})"
        )
    } else {
        format!(
            "Windows refused to create Houston's window, so Houston can't start right now.\n\n\
             Restart your computer, then open Houston again. If this keeps happening, \
             contact support and mention {detail}."
        )
    }
}

/// Probe window creation before the Tauri builder runs. Returns normally when
/// Windows can create and subclass a window (always, off Windows); otherwise
/// reports, shows the dialog and exits the process.
pub fn ensure_window_creation_works() {
    #[cfg(target_os = "windows")]
    {
        let forced = cfg!(debug_assertions)
            .then(|| forced_failure(std::env::var(FORCE_FAIL_ENV).ok().as_deref()))
            .flatten();
        let mut failed_attempts = 0;
        loop {
            match forced.map(Err).unwrap_or_else(win::probe) {
                Ok(()) => {
                    if failed_attempts > 0 {
                        tracing::warn!(
                            attempts = failed_attempts + 1,
                            "[window-preflight] window creation recovered after retrying"
                        );
                    }
                    return;
                }
                Err(failure) => {
                    failed_attempts += 1;
                    let Some(delay) = retry_delay(failed_attempts) else {
                        fail_closed(failure, failed_attempts);
                    };
                    tracing::warn!(
                        call = failure.step.win32_call(),
                        code = failure.code,
                        attempt = failed_attempts,
                        "[window-preflight] window creation failed; retrying"
                    );
                    std::thread::sleep(delay);
                }
            }
        }
    }
}

/// Report the persistent failure (the ERROR record becomes the Sentry event
/// that finally carries the Win32 code), flush it so a process exit does not
/// drop it, tell the user, and exit without the panic.
#[cfg(target_os = "windows")]
fn fail_closed(failure: Failure, attempts: usize) -> ! {
    tracing::error!(
        call = failure.step.win32_call(),
        code = failure.code,
        attempts,
        "[window-preflight] Windows cannot create Houston's window; exiting before the event loop asserts"
    );
    if let Some(client) = sentry::Hub::current().client() {
        client.flush(Some(Duration::from_secs(3)));
    }
    win::show_dialog(DIALOG_TITLE, &dialog_body(&failure));
    std::process::exit(1)
}

#[cfg(target_os = "windows")]
mod win;

#[cfg(test)]
mod tests {
    use super::{
        dialog_body, forced_failure, is_resource_exhaustion, retry_delay, Failure, Step,
        DIALOG_TITLE,
    };
    use std::time::Duration;

    #[test]
    fn retries_five_times_over_about_two_and_a_half_seconds() {
        let delays: Vec<Duration> = (1..).map_while(retry_delay).collect();
        assert_eq!(delays.len(), 4, "four retries after the first attempt");
        assert!(delays.windows(2).all(|pair| pair[0] < pair[1]), "backs off");
        let total: Duration = delays.iter().sum();
        assert!(total <= Duration::from_secs(3), "total {total:?}");
        assert_eq!(retry_delay(0), None, "no delay before the first attempt");
    }

    #[test]
    fn forced_failure_needs_a_numeric_code() {
        assert_eq!(forced_failure(None), None);
        assert_eq!(forced_failure(Some("")), None);
        assert_eq!(forced_failure(Some("nope")), None);
        assert_eq!(
            forced_failure(Some(" 1450 ")),
            Some(Failure {
                step: Step::CreateWindow,
                code: 1450,
            })
        );
    }

    #[test]
    fn exhaustion_codes_are_the_three_out_of_resources_errors() {
        for code in [8, 14, 1450] {
            assert!(is_resource_exhaustion(code), "{code}");
        }
        for code in [0, 5, 1407, 1410] {
            assert!(!is_resource_exhaustion(code), "{code}");
        }
    }

    #[test]
    fn exhaustion_dialog_tells_the_user_to_close_apps_or_restart() {
        let body = dialog_body(&Failure {
            step: Step::CreateWindow,
            code: 8,
        });
        assert!(body.contains("Close a few apps or restart your computer"));
        assert!(body.contains("error 8 in CreateWindowExW"));
    }

    #[test]
    fn other_failures_point_at_support_with_the_code() {
        let body = dialog_body(&Failure {
            step: Step::Subclass,
            code: 1407,
        });
        assert!(body.contains("contact support"));
        assert!(body.contains("error 1407 in SetWindowSubclass"));
    }

    #[test]
    fn copy_never_leaks_internals() {
        for step in [Step::RegisterClass, Step::CreateWindow, Step::Subclass] {
            let body = dialog_body(&Failure { step, code: 1450 });
            for banned in ["tao", "panic", "assert", "HWND", "event loop"] {
                assert!(!body.contains(banned), "{banned:?} in {body:?}");
            }
        }
        assert!(
            !DIALOG_TITLE.contains('\u{2014}'),
            "no em dash in user copy"
        );
    }
}
