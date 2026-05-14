//! Process-wide per-file exclusion lock.
//!
//! Every read-modify-write callsite on a `.houston/**/*.json` file goes
//! through [`with_file_lock`] so concurrent writers serialize. The
//! lifecycle reaper, the heartbeat, the HTTP update handler, and the
//! orphan-PID recorder can all race against the same file; without this
//! a classic lost-update bug surfaces: writer A reads the list, writer
//! B reads the list, writer A writes its mutation, writer B writes its
//! mutation back including A's overwritten state.
//!
//! Implementation: a global `HashMap<canonical_path → Arc<Mutex<()>>>`.
//! The registry mutex protects map lookup/insertion; the inner mutex
//! protects the file. Inner mutexes are kept in the map indefinitely —
//! their footprint is one `Arc<Mutex<()>>` per ever-touched file, which
//! for Houston (one workspace per agent, ~10s of agents per user) is
//! noise.
//!
//! Synchronous on purpose: every critical section is `read_json` →
//! mutate → `write_json`, all `std::fs` blocking I/O. There are no
//! `.await` points inside, so a `std::sync::Mutex` is safe to hold from
//! async tokio tasks (no scheduler starvation, no deadlock-on-yield).
//!
//! Cross-process locks (e.g. an external editor stomping on the same
//! activity.json) are out of scope. The file watcher catches those
//! after-the-fact as ActivityChanged events; the engine doesn't try to
//! be the single writer for the whole machine.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

static REGISTRY: LazyLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Run `f` while holding the exclusive lock for `path`. Any other caller
/// targeting the same canonicalized path blocks until `f` returns.
///
/// Canonicalization is best-effort: if the path doesn't exist yet (which
/// happens on first write to a brand-new agent), we fall back to the
/// path as supplied. That's fine for the lifetime of one engine process —
/// every subsequent call from the same engine will produce the same
/// non-canonical key.
pub fn with_file_lock<F, R>(path: &Path, f: F) -> R
where
    F: FnOnce() -> R,
{
    let key = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mutex = {
        let mut reg = REGISTRY.lock().expect("file mutex registry poisoned");
        reg.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = mutex.lock().expect("file mutex poisoned");
    f()
}

#[cfg(test)]
mod tests {
    use super::with_file_lock;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn serializes_concurrent_callers_on_same_path() {
        // Spawn N threads that all enter the critical section for the
        // same path. Inside, each increments a shared counter and
        // verifies that no other caller observed an inconsistent
        // intermediate state. Without the lock this fails immediately
        // on multi-core hardware.
        let path = PathBuf::from("/tmp/houston-test-mutex");
        let counter = Arc::new(AtomicUsize::new(0));
        let inconsistent = Arc::new(AtomicUsize::new(0));
        let mut handles = Vec::new();
        for _ in 0..50 {
            let path = path.clone();
            let counter = counter.clone();
            let inconsistent = inconsistent.clone();
            handles.push(thread::spawn(move || {
                with_file_lock(&path, || {
                    let before = counter.load(Ordering::SeqCst);
                    // If another thread sneaks in here, `counter` will
                    // have moved by the time we read it again.
                    std::thread::sleep(std::time::Duration::from_micros(50));
                    let after = counter.load(Ordering::SeqCst);
                    if before != after {
                        inconsistent.fetch_add(1, Ordering::SeqCst);
                    }
                    counter.fetch_add(1, Ordering::SeqCst);
                });
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::SeqCst), 50);
        assert_eq!(
            inconsistent.load(Ordering::SeqCst),
            0,
            "with_file_lock did not actually serialize"
        );
    }

    #[test]
    fn different_paths_do_not_block_each_other() {
        // Locks are per-path. Two threads targeting different paths
        // should not contend. We verify by holding lock A in thread 1
        // and grabbing lock B in thread 2; thread 2 must finish before
        // thread 1 releases (we hold for 200ms).
        let path_a = PathBuf::from("/tmp/houston-test-mutex-A");
        let path_b = PathBuf::from("/tmp/houston-test-mutex-B");
        let thread2_done = Arc::new(AtomicUsize::new(0));
        let thread2_done_clone = thread2_done.clone();

        let h1 = thread::spawn(move || {
            with_file_lock(&path_a, || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                thread2_done_clone.load(Ordering::SeqCst)
            })
        });

        // Give thread 1 time to acquire path_a.
        std::thread::sleep(std::time::Duration::from_millis(20));

        let h2 = thread::spawn(move || {
            with_file_lock(&path_b, || {
                thread2_done.store(1, Ordering::SeqCst);
            })
        });

        h2.join().unwrap();
        let thread2_done_at_thread1_release = h1.join().unwrap();
        assert_eq!(
            thread2_done_at_thread1_release, 1,
            "different paths must not contend"
        );
    }
}
