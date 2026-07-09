//! One-click desktop→cloud migration (HOU-719) — the shell side.
//!
//! The cloud build never spawns the host sidecar for normal use, but the
//! binary still ships (externalBin). These commands let the first-run
//! migration wizard (1) detect leftover legacy data under `houston_dir()`
//! and (2) spawn that bundled host ONCE, passively (`HOUSTON_PASSIVE=1`:
//! boot migrations convert the old tree in place, then it serves reads;
//! no scheduler, no watcher), so the wizard can export each agent over
//! loopback HTTP and upload it to the user's cloud agents.
//!
//! The source host is a plain [`EngineSubprocess`] — NOT `spawn_supervisor`:
//! a migration source must never restart itself; if it dies the wizard
//! re-invokes `start_migration_source_host` explicitly.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::Manager;

use crate::engine_supervisor::{
    reserve_free_port, resolve_engine_binary, wait_until_host_healthy, EngineSubprocess,
};
use crate::houston_dir;

/// A large chat db migrates BEFORE the boot banner prints, so the spawn
/// deadline must absorb minutes of sqlite → transcript conversion — the
/// normal sidecar's 30s (calibrated to Gatekeeper) would kill it mid-boot.
const SOURCE_BANNER_TIMEOUT: Duration = Duration::from_secs(300);

/// The one migration-source subprocess, if running. Managed by Tauri.
#[derive(Default)]
pub struct MigrationSourceState(pub Mutex<Option<EngineSubprocess>>);

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDetection {
    pub has_workspaces: bool,
    pub has_chat_db: bool,
    pub workspace_dirs: Vec<String>,
    pub agent_dir_count: usize,
}

/// Pure scan so the detection is unit-testable against a temp root.
fn detect_in(root: &Path) -> LegacyDetection {
    let workspaces = root.join("workspaces");
    let mut workspace_dirs: Vec<String> = Vec::new();
    let mut agent_dir_count = 0usize;
    if let Ok(entries) = std::fs::read_dir(&workspaces) {
        for ws in entries.flatten() {
            let name = ws.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || !ws.path().is_dir() {
                continue;
            }
            let agents = std::fs::read_dir(ws.path())
                .map(|it| {
                    it.flatten()
                        .filter(|a| {
                            !a.file_name().to_string_lossy().starts_with('.')
                                && a.path().is_dir()
                        })
                        .count()
                })
                .unwrap_or(0);
            if agents > 0 {
                agent_dir_count += agents;
                workspace_dirs.push(name);
            }
        }
    }
    workspace_dirs.sort();
    LegacyDetection {
        has_workspaces: agent_dir_count > 0,
        has_chat_db: root.join("db").join("houston.db").is_file(),
        workspace_dirs,
        agent_dir_count,
    }
}

/// Is there legacy desktop data worth migrating? Read-only; never creates.
#[tauri::command]
pub fn detect_legacy_houston() -> Result<LegacyDetection, String> {
    Ok(detect_in(&houston_dir()))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceHostHandshake {
    pub base_url: String,
    pub token: String,
}

/// Spawn (or return the already-running) passive migration-source host
/// against the legacy tree. Blocks — on the async runtime's blocking pool —
/// until the boot migrations finish and the banner prints (up to 5 minutes
/// for a big chat db), then until `/health` answers.
#[tauri::command]
pub async fn start_migration_source_host(
    app: tauri::AppHandle,
) -> Result<SourceHostHandshake, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<MigrationSourceState>();
        let mut slot = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = slot.as_ref() {
            return Ok(SourceHostHandshake {
                base_url: existing.handshake.base_url(),
                token: existing.handshake.token.clone(),
            });
        }

        let resource_dir = app.path().resource_dir().ok();
        let binary = resolve_engine_binary(resource_dir.as_ref())?;
        let port = reserve_free_port()?;
        let houston = houston_dir();
        tracing::info!(
            "[migration] spawning passive source host {} against {}",
            binary.display(),
            houston.display()
        );
        let env: Vec<(String, String)> = vec![
            ("HOUSTON_HOME".into(), houston.display().to_string()),
            (
                "HOUSTON_WORKSPACES_ROOT".into(),
                houston.join("workspaces").display().to_string(),
            ),
            (
                "HOUSTON_CREDENTIALS_PATH".into(),
                houston.join("credentials.json").display().to_string(),
            ),
            ("HOUSTON_HOST_PORT".into(), port.to_string()),
            ("HOUSTON_PASSIVE".into(), "1".into()),
        ];
        let source = EngineSubprocess::spawn(&binary, SOURCE_BANNER_TIMEOUT, &env)?;
        wait_until_host_healthy(&source.handshake, Duration::from_secs(30))?;
        let handshake = SourceHostHandshake {
            base_url: source.handshake.base_url(),
            token: source.handshake.token.clone(),
        };
        *slot = Some(source);
        Ok(handshake)
    })
    .await
    .map_err(|e| format!("migration source spawn task failed: {e}"))?
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub backup_path: String,
    pub file_count: usize,
    pub byte_count: u64,
}

/// Recursively copy `src` into `dst`, preserving the directory structure.
/// Creates `dst` (and any nested dirs) and `std::fs::copy`s every file.
/// Returns the running (file_count, byte_count) of everything copied.
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<(usize, u64)> {
    std::fs::create_dir_all(dst)?;
    let mut files = 0usize;
    let mut bytes = 0u64;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            let (f, b) = copy_dir_all(&src_path, &dst_path)?;
            files += f;
            bytes += b;
        } else {
            bytes += std::fs::copy(&src_path, &dst_path)?;
            files += 1;
        }
    }
    Ok((files, bytes))
}

/// Make a full local backup of the user's Houston data before the cloud
/// migration uploads it. The backup is a sibling copy of `houston_dir()`
/// named `<dirname>-<YYYYMMDD-HHMMSS>-backup` (a numeric suffix is appended
/// on a same-second collision). The recursive copy runs on the blocking pool
/// so a large tree never freezes the UI thread.
#[tauri::command]
pub async fn backup_houston_data() -> Result<BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = houston_dir();
        if !source.is_dir() || !source.join("workspaces").is_dir() {
            return Err("nothing to back up".to_string());
        }

        let parent = source
            .parent()
            .ok_or_else(|| "houston dir has no parent".to_string())?;
        let dirname = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or_else(|| "houston dir has no name".to_string())?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();

        // Avoid clobbering an existing sibling (same-second re-run).
        let base = parent.join(format!("{dirname}-{stamp}-backup"));
        let mut dest = base.clone();
        let mut n = 1u32;
        while dest.exists() {
            dest = parent.join(format!("{dirname}-{stamp}-backup-{n}"));
            n += 1;
        }

        tracing::info!(
            "[migration] backing up {} -> {}",
            source.display(),
            dest.display()
        );
        let (file_count, byte_count) =
            copy_dir_all(&source, &dest).map_err(|e| format!("backup copy failed: {e}"))?;

        Ok(BackupResult {
            backup_path: dest.display().to_string(),
            file_count,
            byte_count,
        })
    })
    .await
    .map_err(|e| format!("backup task failed: {e}"))?
}

/// Kill the migration-source host (idempotent — absent is success).
#[tauri::command]
pub fn stop_migration_source_host(
    state: tauri::State<'_, MigrationSourceState>,
) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(source) = slot.take() {
        source.kill();
        tracing::info!("[migration] passive source host stopped");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// A unique scratch dir under the OS temp root (no tempfile dep).
    fn scratch() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "houston-migration-detect-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_agents_and_chat_db() {
        let root = scratch();
        std::fs::create_dir_all(root.join("workspaces/Work/Sales")).unwrap();
        std::fs::create_dir_all(root.join("workspaces/Personal/Helper")).unwrap();
        std::fs::create_dir_all(root.join("workspaces/.hidden/X")).unwrap();
        std::fs::create_dir_all(root.join("db")).unwrap();
        std::fs::write(root.join("db/houston.db"), b"sqlite").unwrap();

        let d = detect_in(&root);
        assert_eq!(
            d,
            LegacyDetection {
                has_workspaces: true,
                has_chat_db: true,
                workspace_dirs: vec!["Personal".into(), "Work".into()],
                agent_dir_count: 2,
            }
        );
    }

    #[test]
    fn empty_root_detects_nothing() {
        let root = scratch();
        let d = detect_in(&root);
        assert!(!d.has_workspaces);
        assert!(!d.has_chat_db);
        assert_eq!(d.agent_dir_count, 0);
    }

    #[test]
    fn workspace_with_no_agents_is_not_migratable() {
        let root = scratch();
        std::fs::create_dir_all(root.join("workspaces/Empty")).unwrap();
        let d = detect_in(&root);
        assert!(!d.has_workspaces);
        assert_eq!(d.workspace_dirs, Vec::<String>::new());
    }

    #[test]
    fn copy_dir_all_reproduces_tree_and_counts() {
        let src = scratch();
        std::fs::create_dir_all(src.join("workspaces/Work/Sales")).unwrap();
        std::fs::write(src.join("workspaces/Work/Sales/CLAUDE.md"), b"hello").unwrap();
        std::fs::write(src.join("workspaces/Work/Sales/notes.txt"), b"a longer note").unwrap();
        std::fs::write(src.join("top.json"), b"{}").unwrap();

        let dst = scratch().join("backup");
        let (files, bytes) = copy_dir_all(&src, &dst).unwrap();

        // 3 files: CLAUDE.md (5) + notes.txt (13) + top.json (2) = 20 bytes.
        assert_eq!(files, 3);
        assert_eq!(bytes, 20);

        // Faithful reproduction: same relative paths + contents.
        assert_eq!(
            std::fs::read(dst.join("workspaces/Work/Sales/CLAUDE.md")).unwrap(),
            b"hello"
        );
        assert_eq!(
            std::fs::read(dst.join("workspaces/Work/Sales/notes.txt")).unwrap(),
            b"a longer note"
        );
        assert_eq!(std::fs::read(dst.join("top.json")).unwrap(), b"{}");
        assert!(dst.join("workspaces/Work/Sales").is_dir());
    }
}
