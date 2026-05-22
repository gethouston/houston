//! Engine subprocess supervisor (Phase 4).
//!
//! Spawns `houston-engine` as a child process, parses its stdout for the
//! `HOUSTON_ENGINE_LISTENING port=<p> token=<t>` line, polls `/v1/health`
//! until ready, and hands the `{baseUrl, token}` handshake back to the
//! caller so the Tauri setup can inject `window.__HOUSTON_ENGINE__` before
//! showing the webview.
//!
//! Lifecycle:
//! - Parent exit → child dies. On Unix the child runs in its own process
//!   group via `setpgid` and `Drop` calls `killpg(-pgrp)`. On Windows the
//!   child is spawned with `CREATE_NEW_PROCESS_GROUP` so console events
//!   sent to the parent (CTRL_C_EVENT, CTRL_CLOSE_EVENT) do NOT propagate
//!   to the engine — without this the child catches the parent's Ctrl-C
//!   and exits with `STATUS_CONTROL_C_EXIT` (0xC000013A), which we saw on
//!   Windows MSI builds. Termination still happens through the stdin
//!   watchdog: dropping the supervisor closes the pipe and the engine
//!   exits cleanly on the next read.
//! - Child crash → [`spawn_supervisor`] restarts with 1s..30s exponential
//!   backoff and emits a `houston-event` toast to the webview on each
//!   restart.
//!
//! Not Tauri-specific — the binary path, resource lookup, and webview
//! eval are all resolved by the caller. This module only owns the
//! subprocess dance.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Config discovered from the engine binary's first-line banner.
#[derive(Clone, Debug)]
pub struct EngineHandshake {
    pub port: u16,
    pub token: String,
}

impl EngineHandshake {
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

/// Managed engine subprocess. Drop to kill.
pub struct EngineSubprocess {
    child: Arc<Mutex<Option<Child>>>,
    /// Write-end of the child's stdin pipe. We never write to it —
    /// it's kept alive solely so `Drop` on this struct closes the
    /// pipe, which the engine's watchdog sees as EOF and exits
    /// cleanly. We must hold it OUTSIDE `Child` because
    /// `Child::wait()` closes stdin before blocking, which would
    /// trigger the watchdog the moment the supervisor starts
    /// reaping. Keeping it here means only an actual supervisor
    /// drop (parent process exit) closes the pipe.
    _stdin: Option<ChildStdin>,
    pub handshake: EngineHandshake,
}

impl EngineSubprocess {
    /// Spawn `houston-engine` and wait up to `timeout` for the banner.
    ///
    /// `env` is merged on top of the inherited environment — used by the
    /// Houston app to pass product-layer prompts (`HOUSTON_APP_SYSTEM_PROMPT`,
    /// `HOUSTON_APP_ONBOARDING_PROMPT`) into the engine at boot so the engine
    /// itself carries no product copy.
    pub fn spawn(
        binary: &PathBuf,
        timeout: Duration,
        env: &[(String, String)],
    ) -> Result<Self, String> {
        let mut cmd = Command::new(binary);
        // Pipe stderr so we can forward it to both the parent's tracing
        // sink AND an on-disk `engine.log` next to backend.log. On
        // Windows GUI builds the parent has no console, so inherited
        // stderr disappears into NUL and the engine's tracing output —
        // including panic messages — is lost. The on-disk capture is
        // what `Report bug` ships back to us when an engine subprocess
        // crashes.
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Piped stdin we never write to: when this supervisor
            // process exits (or crashes), the write-end drops and the
            // child's `read(stdin)` returns EOF. The engine's
            // `spawn_parent_watchdog` listens for that and exits,
            // preventing orphan engines holding ports after the app
            // force-quits.
            .stdin(Stdio::piped());
        for (k, v) in env {
            cmd.env(k, v);
        }

        #[cfg(unix)]
        unsafe {
            use std::os::unix::process::CommandExt;
            cmd.pre_exec(|| {
                // New process group — killing the parent won't orphan the child.
                libc_setpgid()
            });
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NEW_PROCESS_GROUP (0x00000200) detaches the child
            // from the parent's console process group. Without it,
            // CTRL_C_EVENT and CTRL_CLOSE_EVENT delivered to the parent
            // propagate to the engine and it dies with
            // STATUS_CONTROL_C_EXIT (0xC000013A) — observed on Windows
            // MSI builds. We never need to send Ctrl+C to the child
            // ourselves; the stdin watchdog handles graceful shutdown.
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            // CREATE_NO_WINDOW (0x08000000) prevents Windows from
            // allocating a fresh console for the engine child.
            // `houston-app.exe` is a GUI Tauri process with no
            // console attached, so without this flag the engine —
            // which compiles with Rust's default `console` PE
            // subsystem so its tracing output stays inspectable when
            // launched from a terminal — pops a visible cmd window
            // every time Houston launches. Tauri's own `Sidecar`
            // helper sets this flag for us; we don't use it
            // (engine_supervisor speaks raw std::process::Command
            // for the stdin-watchdog trick), so we have to set it
            // ourselves.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {}: {e}", binary.display()))?;

        // Take stdin out of the Child BEFORE anything can call
        // `Child::wait()` — wait() closes stdin, which would trip the
        // engine's parent watchdog the moment we start reaping.
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or("no stdout from engine")?;
        let stderr = child.stderr.take().ok_or("no stderr from engine")?;
        let mut reader = BufReader::new(stdout);

        // Forward engine stderr (its tracing sink) to:
        //   1. an on-disk `engine.log` daily-rolled file alongside
        //      `backend.log`, so bug reports include engine traces, and
        //   2. the supervisor's tracing sink as `[engine:stderr] ...`.
        // Without (1), Windows GUI builds discard engine stderr to NUL.
        let stderr_reader = BufReader::new(stderr);
        thread::spawn(move || {
            let logs_dir = houston_tauri::houston_db::db::houston_dir().join("logs");
            let _ = std::fs::create_dir_all(&logs_dir);
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            let log_path = logs_dir.join(format!("engine.log.{today}"));
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .ok();
            use std::io::Write;
            let mut reader = stderr_reader;
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end();
                        if !trimmed.is_empty() {
                            tracing::debug!("[engine:stderr] {trimmed}");
                            if let Some(f) = file.as_mut() {
                                let _ = writeln!(f, "{trimmed}");
                                let _ = f.flush();
                            }
                        }
                    }
                }
            }
        });

        let deadline = Instant::now() + timeout;
        let handshake: EngineHandshake = {
            let mut line = String::new();
            loop {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    return Err(format!("engine did not emit banner within {timeout:?}"));
                }
                line.clear();
                let n = reader
                    .read_line(&mut line)
                    .map_err(|e| format!("engine stdout: {e}"))?;
                if n == 0 {
                    return Err("engine stdout closed without banner".into());
                }
                let trimmed = line.trim_end().to_string();
                tracing::debug!("[engine] {trimmed}");
                if let Some(h) = parse_banner(&trimmed) {
                    break h;
                }
            }
        };

        // Keep draining stdout so the engine never blocks on a full pipe
        // buffer or sees EPIPE from tracing. Tracing already goes to
        // stderr, but this is defense-in-depth and forwards any stray
        // println! from the engine to our tracing sink.
        thread::spawn(move || {
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end();
                        if !trimmed.is_empty() {
                            tracing::debug!("[engine:stdout] {trimmed}");
                        }
                    }
                }
            }
        });

        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            _stdin: stdin,
            handshake,
        })
    }

    /// Block the current thread waiting for the child to exit.
    /// Returns `None` if the child was already killed/reaped.
    pub fn wait(&self) -> Option<std::process::ExitStatus> {
        let mut guard = self.child.lock().ok()?;
        let child = guard.as_mut()?;
        child.wait().ok()
    }

    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                #[cfg(unix)]
                unsafe {
                    // Kill the whole process group so tokio workers + any
                    // grandchildren die with the parent.
                    let pid = child.id() as i32;
                    libc::killpg(pid, libc_sigterm());
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Drop for EngineSubprocess {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Resolve the `houston-engine` binary path.
///
/// Resolution order:
/// 1. `HOUSTON_ENGINE_BIN` env var (dev override / SSH deploy).
/// 2. Debug builds: cargo workspace target (freshest during `bun run
///    tauri dev` — the staged sidecar can be stale if you rebuild just
///    the engine crate).
/// 3. Sibling of the current executable — this is where Tauri's
///    `externalBin` places sidecars in shipped app bundles:
///      - macOS: `Houston.app/Contents/MacOS/houston-engine`
///      - Windows: next to `houston-app.exe`
///      - Linux AppImage: inside the mounted AppImage root
///    Authoritative for release builds. (Tauri's `resource_dir()` points
///    at `Contents/Resources/` on macOS which is the WRONG place for
///    externalBin — sidecars are not resources.)
/// 4. `<resource_dir>/binaries/houston-engine` — legacy / belt-and-braces
///    fallback for platforms that stage externalBin into the resources
///    tree.
/// 5. Release builds: cargo workspace target (last-resort, exists only
///    when running `cargo run --release` outside a bundled `.app`).
///
/// Returning `Err` here causes the Tauri `setup()` closure to abort the
/// app on launch — so this function is a hot path during the "download
/// the new DMG, open it, nothing happens" user experience. Every path we
/// check is worth the extra stat call.
pub fn resolve_engine_binary(resource_dir: Option<&PathBuf>) -> Result<PathBuf, String> {
    let mut tried: Vec<PathBuf> = Vec::new();
    let try_candidate = |p: PathBuf, tried: &mut Vec<PathBuf>| -> Option<PathBuf> {
        if p.exists() {
            Some(p)
        } else {
            tried.push(p);
            None
        }
    };

    // 1. Explicit env override.
    if let Ok(p) = std::env::var("HOUSTON_ENGINE_BIN") {
        let pb = PathBuf::from(p);
        if let Some(hit) = try_candidate(pb, &mut tried) {
            return Ok(hit);
        }
    }

    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..");
    let target_debug = workspace_root.join("target").join("debug").join(bin_name());
    let target_release = workspace_root
        .join("target")
        .join("release")
        .join(bin_name());

    // 2. Debug: prefer cargo target (freshest under `tauri dev`).
    #[cfg(debug_assertions)]
    {
        if let Some(hit) = try_candidate(target_debug.clone(), &mut tried) {
            return Ok(hit);
        }
        if let Some(hit) = try_candidate(target_release.clone(), &mut tried) {
            return Ok(hit);
        }
    }

    // 3. Sibling of the current executable — the bundled-sidecar location
    //    Tauri actually uses on every shipping platform.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            if let Some(hit) = try_candidate(exe_dir.join(bin_name_no_triple()), &mut tried) {
                return Ok(hit);
            }
            if let Some(hit) = try_candidate(
                exe_dir.join(format!("{}-{}", bin_name_no_triple(), host_triple())),
                &mut tried,
            ) {
                return Ok(hit);
            }
        }
    }

    // 4. Resources dir — legacy fallback.
    if let Some(resources) = resource_dir {
        if let Some(hit) = try_candidate(
            resources.join("binaries").join(bin_name_no_triple()),
            &mut tried,
        ) {
            return Ok(hit);
        }
        if let Some(hit) = try_candidate(
            resources
                .join("binaries")
                .join(format!("{}-{}", bin_name_no_triple(), host_triple())),
            &mut tried,
        ) {
            return Ok(hit);
        }
    }

    // 5. Release: cargo target as last resort.
    #[cfg(not(debug_assertions))]
    {
        if let Some(hit) = try_candidate(target_release.clone(), &mut tried) {
            return Ok(hit);
        }
        if let Some(hit) = try_candidate(target_debug.clone(), &mut tried) {
            return Ok(hit);
        }
    }

    Err(format!(
        "houston-engine binary not found. Tried:\n  - {}",
        tried
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join("\n  - ")
    ))
}

fn bin_name_no_triple() -> &'static str {
    if cfg!(windows) {
        "houston-engine.exe"
    } else {
        "houston-engine"
    }
}

fn bin_name() -> &'static str {
    bin_name_no_triple()
}

/// Host target triple — best-effort. Matches the suffix tauri `externalBin`
/// uses when copying sidecars into the bundle.
fn host_triple() -> &'static str {
    // These match the triples tauri-cli emits. Extend as needed.
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    {
        "unknown-unknown-unknown"
    }
}

/// Trait the supervisor calls back on to notify the UI. Lets us keep the
/// supervisor loop free of Tauri types so the module stays testable.
pub trait SupervisorCallbacks: Send + Sync + 'static {
    /// Called whenever the engine subprocess has been (re)started with a
    /// fresh `{baseUrl, token}` handshake.
    fn on_restart(&self, handshake: &EngineHandshake);
}

/// Spawn a background thread that keeps `houston-engine` alive. On crash,
/// restarts with 1s..30s exponential backoff and invokes `cb.on_restart`.
///
/// Returns the initial [`EngineSubprocess`] so the caller can grab the
/// first handshake synchronously (needed for
/// `initializationScript` before the webview is shown).
pub fn spawn_supervisor<C: SupervisorCallbacks>(
    binary: PathBuf,
    banner_timeout: Duration,
    env: Vec<(String, String)>,
    cb: Arc<C>,
) -> Result<Arc<Mutex<Option<EngineSubprocess>>>, String> {
    let initial = EngineSubprocess::spawn(&binary, banner_timeout, &env)?;
    let slot: Arc<Mutex<Option<EngineSubprocess>>> = Arc::new(Mutex::new(Some(initial)));
    let slot_clone = slot.clone();

    thread::spawn(move || {
        let mut backoff = Duration::from_secs(1);
        loop {
            // Wait for current child to exit.
            let exit = {
                let guard = slot_clone.lock().ok();
                guard.and_then(|g| g.as_ref().map(|s| s.wait())).flatten()
            };

            tracing::warn!("[engine] subprocess exited: {:?}", exit);

            // Drop the exited handle.
            if let Ok(mut guard) = slot_clone.lock() {
                *guard = None;
            }

            thread::sleep(backoff);

            match EngineSubprocess::spawn(&binary, banner_timeout, &env) {
                Ok(new) => {
                    cb.on_restart(&new.handshake);
                    if let Ok(mut guard) = slot_clone.lock() {
                        *guard = Some(new);
                    }
                    backoff = Duration::from_secs(1);
                }
                Err(e) => {
                    tracing::error!("[engine] restart failed: {e}");
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
            }
        }
    });

    Ok(slot)
}

fn parse_banner(line: &str) -> Option<EngineHandshake> {
    // Format: HOUSTON_ENGINE_LISTENING port=<p> token=<t>
    let rest = line.strip_prefix("HOUSTON_ENGINE_LISTENING ")?;
    let mut port: Option<u16> = None;
    let mut token: Option<String> = None;
    for field in rest.split_whitespace() {
        if let Some(p) = field.strip_prefix("port=") {
            port = p.parse().ok();
        } else if let Some(t) = field.strip_prefix("token=") {
            token = Some(t.to_string());
        }
    }
    Some(EngineHandshake {
        port: port?,
        token: token?,
    })
}

#[cfg(unix)]
fn libc_setpgid() -> std::io::Result<()> {
    unsafe {
        if libc::setpgid(0, 0) == -1 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}

#[cfg(unix)]
fn libc_sigterm() -> i32 {
    15
}

#[cfg(unix)]
#[allow(dead_code)]
mod libc {
    extern "C" {
        pub fn setpgid(pid: i32, pgid: i32) -> i32;
        pub fn killpg(pgrp: i32, sig: i32) -> i32;
    }
}

/// Poll `/v1/health` until a 2xx response, or timeout. Uses bearer auth.
pub fn wait_until_healthy(handshake: &EngineHandshake, timeout: Duration) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let url = format!("{}/v1/health", handshake.base_url());
    let deadline = Instant::now() + timeout;
    let mut last_err = None;
    while Instant::now() < deadline {
        match client
            .get(&url)
            .bearer_auth(&handshake.token)
            .timeout(Duration::from_secs(2))
            .send()
        {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) => last_err = Some(format!("status {}", r.status())),
            Err(e) => last_err = Some(e.to_string()),
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(format!(
        "engine health check timed out ({})",
        last_err.unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_banner() {
        let h = parse_banner("HOUSTON_ENGINE_LISTENING port=12345 token=abc").unwrap();
        assert_eq!(h.port, 12345);
        assert_eq!(h.token, "abc");
    }

    #[test]
    fn rejects_unknown_line() {
        assert!(parse_banner("hello world").is_none());
    }
}
