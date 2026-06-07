//! Serializes tests that mutate process environment variables.

use std::sync::{Mutex, MutexGuard};

static ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

/// Held for the duration of an env-mutating test. Recovers from poison.
pub fn lock_env_test() -> MutexGuard<'static, ()> {
    ENV_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
