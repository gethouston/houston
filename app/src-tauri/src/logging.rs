use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::SystemTime;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Guard kept alive for the entire process lifetime via OnceLock.
static GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Initialize tracing with file output + Sentry breadcrumb pipeline.
///
/// Two layers chained on a single Registry:
///   - `fmt_layer`  → rolling daily file `backend.log` (current behavior)
///   - `sentry_tracing::layer()` → INFO+ events become Sentry breadcrumbs;
///     ERROR events become standalone Sentry events. No-op if `sentry::init`
///     hasn't been called (e.g. empty SENTRY_DSN), so safe to always include.
///
/// Result: when a Rust panic or explicit `tracing::error!` lands in Sentry,
/// the last ~100 INFO/WARN log lines auto-attach as breadcrumbs — the
/// reliability engineer sees what was happening up until the crash without
/// asking the user to send their log file.
///
/// Privacy note: breadcrumbs include the raw tracing message strings, which
/// may contain file paths (e.g. `binary.display()`) and agent names. This
/// is a conscious tradeoff — debug value > privacy for crash data on a
/// beta product. Revisit if leak surface becomes a real concern; sanitize
/// via `sentry_tracing::layer().event_mapper(...)` at that point.
///
/// Call once at app startup, before any other code runs.
pub fn init(data_dir: &Path) {
    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&logs_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "backend.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Store the guard so the background writer thread stays alive
    let _ = GUARD.set(guard);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info,houston_terminal_manager=debug,houston_tauri=debug,houston_app=debug")
    });

    let fmt_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(true)
        .with_line_number(true);

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(sentry_tracing::layer())
        .init();
}

fn logs_dir() -> PathBuf {
    houston_tauri::houston_db::db::houston_dir().join("logs")
}

fn frontend_log_path() -> PathBuf {
    logs_dir().join("frontend.log")
}

/// Tauri command: frontend writes log entries here.
#[tauri::command]
pub fn write_frontend_log(level: String, message: String, context: Option<String>) {
    let logs = logs_dir();
    fs::create_dir_all(&logs).ok();

    let timestamp = chrono::Utc::now().to_rfc3339();
    let ctx = context.as_deref().unwrap_or("");
    let line = if ctx.is_empty() {
        format!("{timestamp} [{level}] {message}\n")
    } else {
        format!("{timestamp} [{level}] {message} | {ctx}\n")
    };

    use std::io::Write;
    match fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(frontend_log_path())
    {
        Ok(mut f) => {
            if let Err(e) = f.write_all(line.as_bytes()) {
                eprintln!("failed to write frontend log: {e}");
            }
        }
        Err(e) => eprintln!("failed to open frontend log: {e}"),
    }
}

/// Tauri command: read the last N lines from both log files.
/// Returns { backend: string, frontend: string }.
#[tauri::command]
pub fn read_recent_logs(lines: Option<usize>) -> serde_json::Value {
    let n = lines.unwrap_or(100);
    let backend = tail_file(&latest_backend_log_path(), n);
    let frontend = tail_file(&frontend_log_path(), n);
    serde_json::json!({ "backend": backend, "frontend": frontend })
}

fn latest_backend_log_path() -> PathBuf {
    let logs = logs_dir();
    latest_log_matching(&logs, "backend.log").unwrap_or_else(|| logs.join("backend.log"))
}

fn latest_log_matching(dir: &Path, prefix: &str) -> Option<PathBuf> {
    let mut candidates: Vec<(SystemTime, PathBuf)> = fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !name.starts_with(prefix) {
                return None;
            }
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            Some((modified, path))
        })
        .collect();

    candidates.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    candidates.pop().map(|(_, path)| path)
}

fn tail_file(path: &Path, n: usize) -> String {
    match fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = lines.len().saturating_sub(n);
            lines[start..].join("\n")
        }
        Err(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_log_matching_uses_newest_rotated_backend_log() {
        let dir = std::env::temp_dir().join(format!(
            "houston-log-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        fs::create_dir_all(&dir).expect("create temp log dir");

        let old = dir.join("backend.log.2026-04-27");
        let current = dir.join("backend.log.2026-04-28");
        fs::write(&old, "old").expect("write old log");
        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(&current, "current").expect("write current log");

        let selected = latest_log_matching(&dir, "backend.log");
        assert_eq!(selected.as_deref(), Some(current.as_path()));

        fs::remove_dir_all(&dir).expect("remove temp log dir");
    }
}
