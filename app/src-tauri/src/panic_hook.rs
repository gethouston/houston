//! Process-wide panic hook that routes panic info through `tracing::error!`
//! before chaining to whatever hook was previously installed (the default
//! Rust hook, or Sentry's, etc.).
//!
//! Why: in shipped macOS bundles, stderr from the Tauri parent goes to
//! `os_log` / Console.app, not the rolling log file we collect from users.
//! A panic that took down the app process used to vanish from submitted
//! bug reports. With this hook, the message, location, thread name, and
//! a forced backtrace land in `~/Library/Logs/ai.gethouston.app/houston.log.<date>`
//! alongside the rest of the supervisor's tracing output.
//!
//! Caveat on flush: `tracing_appender::non_blocking` writes through a
//! background worker. On `panic = unwind` (Rust's default) the static
//! `WorkerGuard` flushes via `Drop` when the process exits normally after
//! unwind, so the panic line reaches disk. On `panic = abort` no flush
//! happens — but Houston doesn't configure abort, so this is fine in
//! practice. Background-thread panics flush as usual because the worker
//! stays alive.

use std::backtrace::Backtrace;
use std::panic;

/// Install the hook. Call once after `logging::init`, before any code that
/// might panic during startup.
pub fn install() {
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".into());

        let payload: &str = info
            .payload()
            .downcast_ref::<&'static str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<non-string payload>");

        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>");

        // force_capture so we always get frames, regardless of RUST_BACKTRACE.
        // Panics are rare enough that the cost is irrelevant; the alternative
        // is "we got a panic but no idea where," which defeats the purpose.
        let backtrace = Backtrace::force_capture();

        tracing::error!(
            target: "panic",
            "thread '{thread_name}' panicked at {location}: {payload}\n{backtrace}"
        );

        previous(info);
    }));
}
