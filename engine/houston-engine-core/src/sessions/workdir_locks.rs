use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, OwnedMutexGuard};

pub type WorkdirSessionGuard = OwnedMutexGuard<()>;

#[derive(Default, Clone)]
pub struct WorkdirLocks {
    inner: Arc<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>>,
}

impl WorkdirLocks {
    /// Acquire the per-folder session lock, waiting if another session holds
    /// it. Callers that want two sessions in the same folder to *queue*
    /// (routines — issue #362) await this; the guard releases on drop.
    pub async fn acquire(&self, working_dir: &Path) -> WorkdirSessionGuard {
        let key = normalize_key(working_dir);
        let lock = {
            let mut locks = self.inner.lock().await;
            locks
                .entry(key)
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        lock.lock_owned().await
    }
}

fn normalize_key(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn second_acquire_blocks_until_guard_drops() {
        let dir = TempDir::new().unwrap();
        let locks = WorkdirLocks::default();

        let first = locks.acquire(dir.path()).await;

        // A second acquire on the held folder must not resolve immediately…
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), locks.acquire(dir.path()))
                .await
                .is_err()
        );

        // …but does once the first guard drops.
        drop(first);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), locks.acquire(dir.path()))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn acquire_waits_until_guard_drops() {
        let dir = TempDir::new().unwrap();
        let locks = WorkdirLocks::default();
        let first = locks.acquire(dir.path()).await;

        let locks2 = locks.clone();
        let path = dir.path().to_path_buf();
        let started = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let started2 = started.clone();
        let handle = tokio::spawn(async move {
            let _guard = locks2.acquire(&path).await;
            started2.store(true, std::sync::atomic::Ordering::SeqCst);
        });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert!(!started.load(std::sync::atomic::Ordering::SeqCst));
        drop(first);
        handle.await.unwrap();
        assert!(started.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn allows_different_workdirs() {
        let one = TempDir::new().unwrap();
        let two = TempDir::new().unwrap();
        let locks = WorkdirLocks::default();

        // Distinct folders never contend — both acquire without waiting.
        let _first = tokio::time::timeout(std::time::Duration::from_millis(50), locks.acquire(one.path()))
            .await
            .expect("first folder acquires immediately");
        let _second = tokio::time::timeout(std::time::Duration::from_millis(50), locks.acquire(two.path()))
            .await
            .expect("second folder acquires immediately");
    }

    #[tokio::test]
    async fn canonicalizes_equivalent_existing_paths() {
        let dir = TempDir::new().unwrap();
        let locks = WorkdirLocks::default();
        let equivalent = dir.path().join(".");

        let _first = locks.acquire(dir.path()).await;
        // `dir` and `dir/.` canonicalize to the same key → the second waits.
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), locks.acquire(&equivalent))
                .await
                .is_err()
        );
    }
}
