//! Regression test for gethouston/houston#240 — "Empty engine logs".
//!
//! The desktop supervisor (`app/src-tauri/src/engine_supervisor.rs`)
//! captures the engine subprocess's STDERR into `engine.log`, and reserves
//! STDOUT for the single `HOUSTON_ENGINE_LISTENING` banner line (its stdout
//! drain only forwards stray lines, the stderr reader is what writes the log
//! file). So the engine must route every `tracing` event to stderr.
//!
//! `tracing_subscriber::fmt()` defaults its writer to stdout. The regression
//! was leaving that default in `init_tracing`, which left `engine.log` empty
//! and leaked every engine trace onto stdout (where it ended up mislabeled in
//! `backend.log` instead). This spawns the real binary and pins the split.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

enum Stream {
    Out,
    Err,
}

#[test]
fn tracing_writes_to_stderr_and_stdout_only_carries_the_banner() {
    let bin = env!("CARGO_BIN_EXE_houston-engine");
    let home = tempfile::tempdir().expect("temp home dir");

    let mut child = Command::new(bin)
        .env("HOUSTON_BIND", "127.0.0.1:0")
        .env("HOUSTON_HOME", home.path())
        .env("HOUSTON_DOCS", home.path())
        .env("HOUSTON_ENGINE_TOKEN", "test-token")
        // Point the relay at an unreachable port: tunnel allocation fails
        // fast (connection refused) and is non-fatal, so the test never
        // touches the network and never blocks on it.
        .env("HOUSTON_TUNNEL_URL", "http://127.0.0.1:1")
        // No stdin watchdog exists today, but keep any future one inert so
        // the engine doesn't exit before it emits the banner.
        .env("HOUSTON_NO_PARENT_WATCHDOG", "1")
        .env("RUST_LOG", "info,houston=debug")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn houston-engine");

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let (tx, rx) = mpsc::channel::<(Stream, String)>();

    // Detached readers: forward each line to the collector. They EOF when
    // the child dies; we never join them, so a child that lingers can't
    // hang the test.
    let tx_out = tx.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if tx_out.send((Stream::Out, line)).is_err() {
                break;
            }
        }
    });
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if tx.send((Stream::Err, line)).is_err() {
                break;
            }
        }
    });

    // The banner and the `listening on` info trace are both emitted
    // synchronously at boot, before any network work. Collect until we've
    // seen both, then drain briefly so a leaked stdout trace would surface.
    let mut stdout_lines: Vec<String> = Vec::new();
    let mut stderr_lines: Vec<String> = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok((Stream::Out, l)) => stdout_lines.push(l),
            Ok((Stream::Err, l)) => stderr_lines.push(l),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        let have_banner = stdout_lines
            .iter()
            .any(|l| l.starts_with("HOUSTON_ENGINE_LISTENING "));
        let have_trace = stderr_lines.iter().any(|l| l.contains("listening on"));
        if have_banner && have_trace {
            thread::sleep(Duration::from_millis(500));
            while let Ok((s, l)) = rx.try_recv() {
                match s {
                    Stream::Out => stdout_lines.push(l),
                    Stream::Err => stderr_lines.push(l),
                }
            }
            break;
        }
    }

    let _ = child.kill();
    let _ = child.wait();

    let stdout_joined = stdout_lines.join("\n");
    let stderr_joined = stderr_lines.join("\n");

    assert!(
        stdout_lines
            .iter()
            .any(|l| l.starts_with("HOUSTON_ENGINE_LISTENING ")),
        "stdout must carry the engine banner.\n--- stdout ---\n{stdout_joined}\n--- stderr ---\n{stderr_joined}"
    );
    assert!(
        stderr_joined.contains("listening on"),
        "engine `tracing` must reach stderr — the supervisor builds engine.log from it (#240).\n--- stderr ---\n{stderr_joined}"
    );
    assert!(
        !stdout_joined.contains("listening on"),
        "engine `tracing` must NOT leak onto stdout — stdout is banner-only (#240).\n--- stdout ---\n{stdout_joined}"
    );
}
