//! Windows termination: `taskkill /T /F` (already forced, walks the
//! tree), verified via `tasklist`, retried once — a child spawned while
//! taskkill walks the tree can escape the first traversal.

use super::{Duration, POLL_INTERVAL};

/// `tasklist /FI "PID eq <pid>"` prints a table row containing the pid
/// when the process exists, or an INFO banner when it doesn't.
async fn alive(pid: u32) -> bool {
    let output = tokio::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .await;
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&format!(" {pid} ")),
        Err(e) => {
            tracing::warn!("[process_kill] tasklist probe failed for pid {pid}: {e}");
            false
        }
    }
}

async fn wait_gone(pid: u32, grace: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + grace;
    loop {
        if !alive(pid).await {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

pub(super) async fn terminate(root: u32, term_grace: Duration, kill_grace: Duration) -> bool {
    for (attempt, grace) in [(1u8, term_grace), (2, kill_grace)] {
        let status = tokio::process::Command::new("taskkill")
            .args(["/PID", &root.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
        match status {
            // 128 = "process not found" — already dead, verify below.
            Ok(s) if s.success() || s.code() == Some(128) => {}
            Ok(s) => tracing::warn!(
                "[process_kill] taskkill attempt {attempt} for pid {root} exited with {s}"
            ),
            Err(e) => tracing::warn!(
                "[process_kill] taskkill attempt {attempt} for pid {root} failed to run: {e}"
            ),
        }
        if wait_gone(root, grace).await {
            return true;
        }
    }
    tracing::error!(
        "[process_kill] process tree for pid {root} survived taskkill /T /F — manual cleanup may be required"
    );
    false
}
