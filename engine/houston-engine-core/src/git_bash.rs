//! Bundled Git Bash provisioning for Windows.
//!
//! Claude Code on Windows refuses to launch without `bash.exe` — it
//! needs the msys2 POSIX runtime to execute shell commands. Houston
//! bundles `PortableGit-*.7z.exe` (the official self-extracting build
//! from git-for-windows) inside the MSI under
//! `resources/bin/git-bash-<arch>.7z.exe` and extracts it once on
//! first launch into `%LOCALAPPDATA%\Programs\Houston\runtime\
//! git-bash-<arch>\`. Subsequent launches return the cached path
//! immediately.
//!
//! Why not bundle the extracted tree? PortableGit extracts to ~410 MB
//! per arch but compresses to ~57 MB via 7z. WiX/CAB compression is
//! much worse than 7z on binary content, so shipping the SFX cuts the
//! MSI delta to a quarter of what the extracted tree would cost.
//! First-launch extraction is a one-time ~3-5s cost on a fresh
//! install.
//!
//! No-op on non-Windows.

#[cfg(target_os = "windows")]
mod imp {
    use std::path::PathBuf;
    use std::sync::OnceLock;

    /// Cache the resolved path for the process lifetime. Extraction is
    /// idempotent + cheap-to-check on re-entry, but a OnceLock saves
    /// the disk-stat round-trip on every claude spawn.
    static CACHED: OnceLock<Option<PathBuf>> = OnceLock::new();

    /// Returns the path to a usable `bash.exe`, extracting the bundled
    /// PortableGit if needed. `None` if no bundle ships in this build
    /// (e.g. dev runs with no fetched CLIs) — callers should fall back
    /// to their existing PATH probe.
    pub fn ensure_bundled_bash() -> Option<PathBuf> {
        if let Some(cached) = CACHED.get() {
            return cached.clone();
        }
        let resolved = resolve();
        let _ = CACHED.set(resolved.clone());
        resolved
    }

    fn resolve() -> Option<PathBuf> {
        let sfx = houston_cli_bundle::bundled_git_bash_sfx()?;
        let arch = std::env::consts::ARCH;
        let target_dir = extraction_root()?.join(format!("git-bash-{arch}"));
        let bash = target_dir.join("bin").join("bash.exe");

        if bash.is_file() && marker_matches(&target_dir, &sfx) {
            return Some(bash);
        }

        // Stale or missing — clear and re-extract. We never extract
        // into a partially-populated directory because PortableGit's
        // SFX overwrites freely but won't remove now-deleted files
        // from a previous Git version.
        if target_dir.exists() {
            if let Err(e) = std::fs::remove_dir_all(&target_dir) {
                tracing::warn!(
                    "[git-bash] failed to clear stale {}: {e}",
                    target_dir.display()
                );
                return None;
            }
        }
        if let Err(e) = std::fs::create_dir_all(&target_dir) {
            tracing::warn!(
                "[git-bash] failed to create {}: {e}",
                target_dir.display()
            );
            return None;
        }

        tracing::info!(
            "[git-bash] extracting {} into {}",
            sfx.display(),
            target_dir.display()
        );
        let started = std::time::Instant::now();
        // PortableGit's 7z SFX accepts `-y -o<path>` per Igor Pavlov's
        // SFX convention. NB: `-o` and the path must NOT be separated
        // by a space.
        let output = std::process::Command::new(&sfx)
            .arg("-y")
            .arg(format!("-o{}", target_dir.display()))
            .output();

        match output {
            Ok(out) if out.status.success() => {
                tracing::info!(
                    "[git-bash] extracted in {:.1}s",
                    started.elapsed().as_secs_f32()
                );
            }
            Ok(out) => {
                tracing::warn!(
                    "[git-bash] SFX exited {} stdout={:?} stderr={:?}",
                    out.status,
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                return None;
            }
            Err(e) => {
                tracing::warn!("[git-bash] SFX spawn failed: {e}");
                return None;
            }
        }

        if !bash.is_file() {
            tracing::warn!(
                "[git-bash] extraction reported success but {} is missing",
                bash.display()
            );
            return None;
        }
        write_marker(&target_dir, &sfx);
        Some(bash)
    }

    /// `%LOCALAPPDATA%\Programs\Houston\runtime` — extraction root.
    /// Use LOCALAPPDATA so the data is user-scoped (not per-machine)
    /// and survives Houston updates that preserve user state.
    fn extraction_root() -> Option<PathBuf> {
        dirs::data_local_dir().map(|d| d.join("Programs").join("Houston").join("runtime"))
    }

    /// Marker file: stores the SFX's mtime+len so a fresh Houston
    /// build (which usually bumps PortableGit too) triggers re-extract.
    /// Cheap (~1ms) and avoids re-hashing the 57 MB SFX on every boot.
    fn marker_path(target_dir: &std::path::Path) -> PathBuf {
        target_dir.join(".sfx-marker")
    }

    fn marker_value(sfx: &std::path::Path) -> Option<String> {
        let meta = std::fs::metadata(sfx).ok()?;
        let mtime = meta.modified().ok()?;
        let secs = mtime
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Some(format!("{}:{}", meta.len(), secs))
    }

    fn marker_matches(target_dir: &std::path::Path, sfx: &std::path::Path) -> bool {
        let expected = match marker_value(sfx) {
            Some(v) => v,
            None => return false,
        };
        std::fs::read_to_string(marker_path(target_dir))
            .map(|s| s.trim() == expected)
            .unwrap_or(false)
    }

    fn write_marker(target_dir: &std::path::Path, sfx: &std::path::Path) {
        if let Some(v) = marker_value(sfx) {
            let _ = std::fs::write(marker_path(target_dir), v);
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use std::path::PathBuf;
    pub fn ensure_bundled_bash() -> Option<PathBuf> {
        None
    }
}

pub use imp::ensure_bundled_bash;
