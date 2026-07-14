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
                            !a.file_name().to_string_lossy().starts_with('.') && a.path().is_dir()
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

/// Running totals for [`copy_dir_all`]. `skipped` counts entries that are
/// deliberately not copied: symlinks/junctions and special files.
#[derive(Default, Debug, PartialEq)]
struct CopyStats {
    files: usize,
    bytes: u64,
    skipped: usize,
}

/// Attach the offending path to an IO error — a bare `std::io::Error` renders
/// as just "Acceso denegado. (os error 5)", which no bug report can act on.
fn at_path<T>(res: std::io::Result<T>, path: &Path) -> std::io::Result<T> {
    res.map_err(|e| std::io::Error::new(e.kind(), format!("{}: {e}", path.display())))
}

/// Recursively copy `src` into `dst`, preserving the directory structure.
/// Only regular files and directories are copied; everything else is counted
/// and SKIPPED, because `fs::copy` refuses it and one such entry used to
/// abort the whole backup:
/// - symlinks/junctions (pnpm's node_modules layout: junctions on Windows →
///   ACCESS_DENIED / os error 5, symlinks on macOS/Linux → "not a regular
///   file"). Never followed; targets inside the tree are copied wherever
///   they actually live, targets outside it don't belong in the backup.
/// - sockets/FIFOs/devices an agent process left in its workspace (Unix).
fn copy_dir_all(src: &Path, dst: &Path, stats: &mut CopyStats) -> std::io::Result<()> {
    at_path(std::fs::create_dir_all(dst), dst)?;
    for entry in at_path(std::fs::read_dir(src), src)? {
        let entry = at_path(entry, src)?;
        let src_path = entry.path();
        let file_type = at_path(entry.file_type(), &src_path)?;
        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst.join(entry.file_name()), stats)?;
        } else if file_type.is_file() {
            let dst_path = dst.join(entry.file_name());
            stats.bytes += at_path(std::fs::copy(&src_path, &dst_path), &src_path)?;
            stats.files += 1;
        } else {
            stats.skipped += 1;
        }
    }
    Ok(())
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
        let mut stats = CopyStats::default();
        copy_dir_all(&source, &dest, &mut stats).map_err(|e| format!("backup copy failed: {e}"))?;
        if stats.skipped > 0 {
            tracing::info!(
                "[migration] backup skipped {} symlinks/special files",
                stats.skipped
            );
        }

        Ok(BackupResult {
            backup_path: dest.display().to_string(),
            file_count: stats.files,
            byte_count: stats.bytes,
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
        std::fs::write(
            src.join("workspaces/Work/Sales/notes.txt"),
            b"a longer note",
        )
        .unwrap();
        std::fs::write(src.join("top.json"), b"{}").unwrap();

        let dst = scratch().join("backup");
        let mut stats = CopyStats::default();
        copy_dir_all(&src, &dst, &mut stats).unwrap();

        // 3 files: CLAUDE.md (5) + notes.txt (13) + top.json (2) = 20 bytes.
        assert_eq!(
            stats,
            CopyStats {
                files: 3,
                bytes: 20,
                skipped: 0,
            }
        );

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

    /// Symlinks and special files are skipped, not copied — a directory link
    /// inside an agent workspace (pnpm junction on Windows, pnpm symlink on
    /// macOS) or a leftover socket/FIFO used to abort the whole backup
    /// because `fs::copy` refuses anything but a regular file.
    #[cfg(unix)]
    #[test]
    fn copy_dir_all_skips_symlinks_and_special_files() {
        let src = scratch();
        std::fs::create_dir_all(src.join("workspaces/Work/node_modules/.pnpm/pkg")).unwrap();
        std::fs::write(
            src.join("workspaces/Work/node_modules/.pnpm/pkg/index.js"),
            b"x",
        )
        .unwrap();
        std::os::unix::fs::symlink(
            src.join("workspaces/Work/node_modules/.pnpm/pkg"),
            src.join("workspaces/Work/node_modules/pkg"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            src.join("workspaces/Work/node_modules/.pnpm/pkg/index.js"),
            src.join("workspaces/Work/linked-file.js"),
        )
        .unwrap();
        // A leftover unix socket/FIFO from some agent process.
        let mkfifo = std::process::Command::new("mkfifo")
            .arg(src.join("workspaces/Work/agent.pipe"))
            .status()
            .unwrap();
        assert!(mkfifo.success());

        let dst = scratch().join("backup");
        let mut stats = CopyStats::default();
        copy_dir_all(&src, &dst, &mut stats).unwrap();

        assert_eq!(
            stats,
            CopyStats {
                files: 1,
                bytes: 1,
                skipped: 3,
            }
        );
        // The real file arrived; links and the FIFO were left behind.
        assert!(dst
            .join("workspaces/Work/node_modules/.pnpm/pkg/index.js")
            .is_file());
        assert!(!dst.join("workspaces/Work/node_modules/pkg").exists());
        assert!(!dst.join("workspaces/Work/linked-file.js").exists());
        assert!(!dst.join("workspaces/Work/agent.pipe").exists());
    }

    /// A copy failure must name the offending path — "os error 5" alone is
    /// undiagnosable from a user's bug report.
    #[cfg(unix)]
    #[test]
    fn copy_dir_all_errors_carry_the_path() {
        use std::os::unix::fs::PermissionsExt;

        let src = scratch();
        let locked = src.join("locked");
        std::fs::create_dir_all(&locked).unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();

        let dst = scratch().join("backup");
        let mut stats = CopyStats::default();
        let err = copy_dir_all(&src, &dst, &mut stats).unwrap_err();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(
            err.to_string().contains("locked"),
            "error should name the path: {err}"
        );
    }
}
