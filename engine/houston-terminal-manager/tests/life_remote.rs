//! End-to-end: spawn a Houston session with `provider="life"` via the
//! `SessionManager` API and assert events flow back from a locally-running
//! `lifed`. This is the Stage-0 dogfood receipt for the FULL wiring —
//! everything from `SessionManager::spawn_session` → `session_dispatch` →
//! `LifeRemoteRunner` → `houston-life` → tonic gRPC over UDS → `lifed`.
//!
//! Skipped (with a printed reason) when `/tmp/life/life.sock` is absent —
//! so this passes in CI environments without a Life backend.

use houston_terminal_manager::{Provider, SessionManager, SessionUpdate};
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

const SOCK_PATH: &str = "/tmp/life/life.sock";

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn life_provider_routes_through_lifed_end_to_end() {
    if !Path::new(SOCK_PATH).exists() {
        eprintln!("SKIP: {SOCK_PATH} not present — start `lifed` locally to exercise this test");
        return;
    }

    let life = Provider::from_str("life").expect("life provider registered in REGISTRY");

    let (mut rx, _handle) = SessionManager::spawn_session(
        life,
        "hello from houston".to_string(),
        None,
        None,
        None,
        None,
        None,
        None,
        false,
        false,
    );

    let mut got_session_id: Option<String> = None;
    let mut got_running = false;
    let mut got_terminal_status = false;

    // Drain updates for up to 10s total, breaking early once the
    // session-key + a terminal Status both arrived.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_secs(2), rx.recv()).await {
            Ok(Some(update)) => {
                eprintln!("UPDATE: {update:?}");
                match &update {
                    SessionUpdate::SessionId(sid) => got_session_id = Some(sid.clone()),
                    SessionUpdate::Status(houston_terminal_manager::SessionStatus::Running) => {
                        got_running = true
                    }
                    SessionUpdate::Status(houston_terminal_manager::SessionStatus::Completed)
                    | SessionUpdate::Status(houston_terminal_manager::SessionStatus::Error(_)) => {
                        got_terminal_status = true
                    }
                    _ => {}
                }
                if got_session_id.is_some() && got_terminal_status {
                    break;
                }
            }
            Ok(None) => break, // channel closed (task exited)
            Err(_) => break,   // 2s no-progress timeout
        }
    }

    assert!(
        got_running,
        "expected Running status before any AgentEvent traffic"
    );
    assert!(
        got_session_id.is_some(),
        "expected a SessionId update from LifeRemoteRunner after CreateSession returned"
    );
    assert!(
        got_terminal_status,
        "expected Completed or Error after the AgentEvent stream closed"
    );

    eprintln!(
        "stage-0 e2e via SessionManager: sid={:?} terminal={}",
        got_session_id, got_terminal_status
    );
}
