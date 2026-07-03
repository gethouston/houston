//! Escalating, verified termination of a provider CLI process tree.
//!
//! `sessions::cancel` (engine-core) and the late-PID guard in
//! `session_runner` both need the same guarantee: after Stop, the
//! claude/codex/gemini process AND everything it spawned (shell tools,
//! MCP servers, subagent helpers) are actually gone. Sending one SIGTERM
//! and hoping is not enough — Node CLIs trap TERM, children can ignore
//! it, and `kill`'s exit status only proves the signal was *sent*.
//!
//! Platform strategies live in the submodules: [`unix`] (TERM the
//! process group + descendant snapshot, poll, escalate to KILL) and
//! [`windows`] (`taskkill /T /F`, verify via `tasklist`, retry).

use std::time::Duration;

#[cfg(unix)]
mod unix;
#[cfg(unix)]
use unix as imp;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as imp;

#[cfg(not(any(unix, windows)))]
mod imp {
    use super::Duration;

    pub(super) async fn terminate(root: u32, _term: Duration, _kill: Duration) -> bool {
        tracing::error!("[process_kill] unsupported platform — cannot terminate pid {root}");
        false
    }
}

const TERM_GRACE: Duration = Duration::from_millis(1500);
const KILL_GRACE: Duration = Duration::from_millis(1000);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Terminate `pid` and its whole process tree. Returns `true` only when
/// every tracked process is confirmed dead; failures are logged inside.
pub async fn terminate_process_tree(pid: u32) -> bool {
    imp::terminate(pid, TERM_GRACE, KILL_GRACE).await
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Stdio;

    async fn spawn_sh(script: &str) -> u32 {
        let child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(script)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn test process");
        let pid = child.id().expect("child pid");
        // Detach: the reaper task waits so the pid can't linger as a
        // zombie; tests only check liveness via signal 0.
        tokio::spawn(async move {
            let mut child = child;
            let _ = child.wait().await;
        });
        // Give the shell a beat to exec / fork its children.
        tokio::time::sleep(Duration::from_millis(150)).await;
        pid
    }

    fn alive(pid: u32) -> bool {
        extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        unsafe { kill(pid as i32, 0) == 0 }
    }

    #[tokio::test]
    async fn terminates_simple_process() {
        let pid = spawn_sh("sleep 30").await;
        assert!(alive(pid));
        assert!(terminate_process_tree(pid).await);
        assert!(!alive(pid));
    }

    #[tokio::test]
    async fn escalates_to_sigkill_when_term_is_trapped() {
        let pid = spawn_sh("trap '' TERM; sleep 30").await;
        assert!(alive(pid));
        // Short grace so the test exercises the KILL phase quickly.
        assert!(imp::terminate(pid, Duration::from_millis(200), KILL_GRACE).await);
        assert!(!alive(pid));
    }

    #[tokio::test]
    async fn kills_descendants_too() {
        let pid = spawn_sh("sleep 30 & sleep 30 & wait").await;
        assert!(alive(pid));
        assert!(terminate_process_tree(pid).await);
        assert!(!alive(pid));
    }

    #[tokio::test]
    async fn already_dead_pid_confirms_quickly() {
        // PID far above any real process on test machines.
        assert!(terminate_process_tree(3_999_999).await);
    }
}
