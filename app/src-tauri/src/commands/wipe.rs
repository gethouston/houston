//! Local-data wipe after a hosted account deletion (HOU-991).
//!
//! Only reachable from the hosted-gateway deployment, where the shell never
//! spawns the local host sidecar — so nothing of ours holds handles under the
//! data dir. If something else does anyway (Windows refuses to unlink open
//! files), the command rejects with the real filesystem reason and the
//! frontend surfaces it; it never half-succeeds silently.

use std::fs;
use std::path::Path;

use crate::houston_dir;

/// Delete everything under `dir`, then recreate it empty. A missing dir is
/// success — a retry after a partial failure must not error on what is
/// already gone.
fn wipe_dir(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        fs::remove_dir_all(dir)
            .map_err(|e| format!("could not delete {}: {e}", dir.display()))?;
    }
    fs::create_dir_all(dir).map_err(|e| format!("could not recreate {}: {e}", dir.display()))
}

/// Delete the whole local Houston data tree (`houston_dir()` — `~/.houston`
/// in release, `~/.dev-houston` in debug, `$HOUSTON_HOME` when set), leaving
/// an empty dir behind. Runs on the blocking pool so a large tree never
/// freezes the UI thread.
#[tauri::command]
pub async fn wipe_local_data() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = houston_dir();
        tracing::info!("[account] wiping local Houston data at {}", dir.display());
        wipe_dir(&dir)
    })
    .await
    .map_err(|e| format!("wipe task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("houston-wipe-{}-{name}", std::process::id()))
    }

    #[test]
    fn wipes_populated_tree_and_leaves_empty_dir() {
        let dir = scratch("populated");
        fs::create_dir_all(dir.join("workspaces/Personal/agent/.houston")).unwrap();
        fs::write(dir.join("credentials.json"), b"{}").unwrap();

        wipe_dir(&dir).unwrap();

        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_dir_is_success_and_gets_created() {
        let dir = scratch("missing");
        let _ = fs::remove_dir_all(&dir);

        wipe_dir(&dir).unwrap();

        assert!(dir.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }
}
