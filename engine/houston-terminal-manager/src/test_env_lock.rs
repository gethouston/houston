//! Serializes tests that mutate process-global environment variables
//! (`HOME`, `HOUSTON_HOME`, provider API-key vars). The test runner runs
//! tests in parallel threads of one process, so two tests touching the same
//! env var race; holding this lock for the duration of such a test makes
//! them run one at a time.

use std::sync::{Mutex, MutexGuard, OnceLock};

/// Acquire the global env-test lock. A poisoned lock (a previous test
/// panicked while holding it) is recovered rather than propagated — the
/// guard only serializes access, it guards no invariant of its own.
pub(crate) fn lock_env_test() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}
