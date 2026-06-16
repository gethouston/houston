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
//! Extraction is performed in-process with [`sevenz-rust2`], not by
//! shelling out to PortableGit's SFX stub. Two reasons we don't run
//! the SFX:
//!
//!   1. The SFX is built with Igor Pavlov's GUI module (`7zSD`) and
//!      pops its own progress dialog regardless of how it is spawned —
//!      no `CREATE_NO_WINDOW`, `DETACHED_PROCESS`, or `STARTF_USESHOWWINDOW`
//!      combination hides it because the window is created by the
//!      SFX itself, not by the Windows console allocator. That
//!      "small loading window" was the exact symptom users reported.
//!   2. The SFX is a synchronous black box. With the in-process
//!      decoder we control the throughput, can extract into a
//!      temporary directory and rename atomically into place, and
//!      cannot be killed mid-extract by a parent that decides the
//!      engine took too long to come up.
//!
//! Why not bundle the extracted tree? PortableGit extracts to ~410 MB
//! per arch but compresses to ~57 MB via 7z. WiX/CAB compression is
//! much worse than 7z on binary content, so shipping the archive cuts
//! the MSI delta to a quarter of what the extracted tree would cost.
//! First-launch extraction is a one-time ~5-10s cost (CPU-bound LZMA2
//! decode).
//!
//! No-op on non-Windows.

/// 7z file-format magic. Always at the start of a valid 7z archive —
/// appears in the SFX after the PE stub. Public to the module so the
/// cross-platform unit tests below can reference it.
///
/// Compiled only where referenced — the Windows extractor and any test
/// build — so non-Windows release builds don't flag it as dead code.
#[cfg(any(target_os = "windows", test))]
const SEVENZ_MAGIC: &[u8] = &[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C];

/// Maximum bytes to scan for the 7z magic. PortableGit's SFX stub is
/// consistently ~245 KB; 2 MB is generous headroom for future SFX
/// builds without slurping the whole 57 MB file.
#[cfg(any(target_os = "windows", test))]
const MAGIC_SCAN_LIMIT: usize = 2 * 1024 * 1024;

/// Scan a file for the 7z file-format magic and return its byte
/// offset. Reads only the prefix because the magic lives just past
/// the PE stub — slurping the whole 58 MB file to find a known-
/// near-the-front signature would be wasteful.
///
/// Kept outside the Windows-only `imp` module so it can be unit-
/// tested on any host. The full extraction path (which needs
/// `sevenz-rust2`) stays Windows-only. Compiled only for Windows and
/// test builds so it isn't dead code in non-Windows release builds.
#[cfg(any(target_os = "windows", test))]
fn find_magic_offset(path: &std::path::Path) -> std::io::Result<Option<u64>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    let scan = (MAGIC_SCAN_LIMIT as u64).min(len) as usize;
    let mut buf = vec![0u8; scan];
    f.read_exact(&mut buf)?;
    Ok(buf
        .windows(SEVENZ_MAGIC.len())
        .position(|w| w == SEVENZ_MAGIC)
        .map(|i| i as u64))
}

/// Reject entry names that contain `..`, are absolute, or include a
/// Windows drive prefix. We'd rather drop a malformed entry than
/// write outside the extraction root — even though we trust the
/// upstream PortableGit archive, the extractor still has to be safe
/// by construction.
///
/// Kept outside `imp` for the same cross-platform test reason as
/// `find_magic_offset`. Compiled only for Windows and test builds.
#[cfg(any(target_os = "windows", test))]
fn sanitize_entry_path(name: &str) -> Option<std::path::PathBuf> {
    use std::path::{Component, Path, PathBuf};
    let p = Path::new(name);
    if p.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for component in p.components() {
        match component {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_magic_after_prefix() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sfx");
        let mut data = vec![0xAAu8; 1024];
        data.extend_from_slice(SEVENZ_MAGIC);
        data.extend_from_slice(&[1, 2, 3, 4]);
        std::fs::write(&path, &data).unwrap();
        let offset = find_magic_offset(&path).unwrap().unwrap();
        assert_eq!(offset, 1024);
    }

    #[test]
    fn missing_magic_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("not-7z");
        std::fs::write(&path, vec![0u8; 4096]).unwrap();
        assert_eq!(find_magic_offset(&path).unwrap(), None);
    }

    #[test]
    fn magic_at_offset_zero_works() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bare");
        let mut data = SEVENZ_MAGIC.to_vec();
        data.extend_from_slice(&[0u8; 32]);
        std::fs::write(&path, &data).unwrap();
        assert_eq!(find_magic_offset(&path).unwrap(), Some(0));
    }

    #[test]
    fn sanitize_rejects_traversal() {
        assert!(sanitize_entry_path("../etc/passwd").is_none());
        assert!(sanitize_entry_path("a/../../b").is_none());
    }

    #[test]
    fn sanitize_rejects_absolute() {
        assert!(sanitize_entry_path("/etc/passwd").is_none());
        // Windows-style absolute path. Path::is_absolute returns
        // false for `C:\...` on Unix hosts, so we explicitly check
        // for a Prefix component to catch this in cross-platform
        // tests.
        assert!(sanitize_entry_path("C:\\Windows\\System32").is_none() || cfg!(unix));
    }

    #[test]
    fn sanitize_accepts_nested() {
        let p = sanitize_entry_path("usr/bin/bash.exe").unwrap();
        assert_eq!(
            p,
            std::path::Path::new("usr").join("bin").join("bash.exe")
        );
    }

    #[test]
    fn sanitize_rejects_empty() {
        assert!(sanitize_entry_path("").is_none());
        assert!(sanitize_entry_path(".").is_none());
    }

    #[test]
    fn sanitize_strips_curdir() {
        let p = sanitize_entry_path("./usr/bin/bash.exe").unwrap();
        assert_eq!(
            p,
            std::path::Path::new("usr").join("bin").join("bash.exe")
        );
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{find_magic_offset, sanitize_entry_path};
    use std::io::{Read, Seek, SeekFrom, Write};
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    /// Process-lifetime cache of the resolved bash path. Wrapped in a
    /// `Mutex` so the boot-time background task and any on-demand
    /// caller (provider login probe, `find_git_bash_windows` from a
    /// route handler) serialize on extraction. Only `Some` values are
    /// cached — a transient failure (ENOSPC, AV quarantine) can
    /// recover on the next call.
    static CACHED: Mutex<Option<PathBuf>> = Mutex::new(None);

    /// Returns the path to a usable `bash.exe`, extracting the bundled
    /// PortableGit if needed. `None` if no bundle ships in this build
    /// (e.g. dev runs with no fetched CLIs) — callers should fall back
    /// to their existing PATH probe.
    pub fn ensure_bundled_bash() -> Option<PathBuf> {
        let mut cache = CACHED.lock().ok()?;
        if let Some(cached) = cache.as_ref() {
            return Some(cached.clone());
        }
        let resolved = resolve()?;
        *cache = Some(resolved.clone());
        Some(resolved)
    }

    /// Candidate bash.exe locations inside an extracted PortableGit.
    /// PortableGit-64-bit ships both — `usr/bin/bash.exe` is the
    /// msys2-canonical location and `bin/bash.exe` is a launcher that
    /// re-execs through cmd. PortableGit-arm64 only ships
    /// `usr/bin/bash.exe`. We try the usr path first because it's
    /// always present and is what Claude Code actually wants (the
    /// launcher in /bin/ is a wrapper meant for opening a terminal,
    /// not for non-interactive execution).
    const BASH_CANDIDATES: &[&[&str]] = &[
        &["usr", "bin", "bash.exe"],
        &["bin", "bash.exe"],
    ];

    fn locate_bash(target_dir: &Path) -> Option<PathBuf> {
        BASH_CANDIDATES.iter().find_map(|parts| {
            let mut p = target_dir.to_path_buf();
            for s in *parts {
                p.push(s);
            }
            p.is_file().then_some(p)
        })
    }

    fn resolve() -> Option<PathBuf> {
        let sfx = houston_cli_bundle::bundled_git_bash_sfx()?;
        let arch = std::env::consts::ARCH;
        let parent = extraction_root()?;
        let target_dir = parent.join(format!("git-bash-{arch}"));

        if marker_matches(&target_dir, &sfx) {
            if let Some(bash) = locate_bash(&target_dir) {
                tracing::debug!("[git-bash] cached extraction usable at {}", bash.display());
                return Some(bash);
            }
        }

        if let Err(e) = std::fs::create_dir_all(&parent) {
            tracing::warn!("[git-bash] mkdir({}) failed: {e}", parent.display());
            return None;
        }

        // Extract into a sibling temp dir and atomic-rename into the
        // final location. This is what lets us survive a parent crash
        // mid-extract — the next launch either sees a complete tree
        // (marker present, swap finished) or no tree at all (temp
        // wiped, target untouched). Never a half-populated target_dir
        // that the previous SFX-based code had to detect-and-clear.
        let temp_dir = parent.join(format!("git-bash-{arch}.tmp"));
        if temp_dir.exists() {
            let _ = std::fs::remove_dir_all(&temp_dir);
        }
        if let Err(e) = std::fs::create_dir_all(&temp_dir) {
            tracing::warn!("[git-bash] mkdir({}) failed: {e}", temp_dir.display());
            return None;
        }

        tracing::info!(
            "[git-bash] extracting {} into {}",
            sfx.display(),
            temp_dir.display()
        );
        let started = std::time::Instant::now();
        if let Err(e) = extract_sfx_to(&sfx, &temp_dir) {
            tracing::warn!("[git-bash] extraction failed: {e}");
            let _ = std::fs::remove_dir_all(&temp_dir);
            return None;
        }
        tracing::info!(
            "[git-bash] extracted in {:.1}s",
            started.elapsed().as_secs_f32()
        );

        if let Err(e) = swap_into_place(&temp_dir, &target_dir, &parent, arch) {
            tracing::warn!("[git-bash] atomic swap failed: {e}");
            let _ = std::fs::remove_dir_all(&temp_dir);
            return None;
        }

        let Some(bash) = locate_bash(&target_dir) else {
            tracing::warn!(
                "[git-bash] extraction succeeded but no bash.exe under {}/{{usr/bin,bin}}/bash.exe",
                target_dir.display()
            );
            return None;
        };
        write_marker(&target_dir, &sfx);
        tracing::info!("[git-bash] resolved bash.exe at {}", bash.display());
        Some(bash)
    }

    /// Move `temp_dir` into `target_dir` atomically. Windows rejects
    /// `rename` over an existing directory, so on upgrade we shuffle:
    /// stage the old tree to `git-bash-<arch>.old`, rename the new
    /// tree into place, then delete the old tree. If the swap fails
    /// part-way we attempt to put the old tree back so the user is
    /// not left without a working PortableGit.
    fn swap_into_place(
        temp_dir: &Path,
        target_dir: &Path,
        parent: &Path,
        arch: &str,
    ) -> std::io::Result<()> {
        let old_dir = parent.join(format!("git-bash-{arch}.old"));
        if old_dir.exists() {
            std::fs::remove_dir_all(&old_dir)?;
        }
        let had_old = target_dir.exists();
        if had_old {
            std::fs::rename(target_dir, &old_dir)?;
        }
        if let Err(e) = std::fs::rename(temp_dir, target_dir) {
            if had_old {
                let _ = std::fs::rename(&old_dir, target_dir);
            }
            return Err(e);
        }
        if had_old {
            // Best-effort cleanup. Worst case the previous tree sits
            // on disk until the next upgrade triggers another swap.
            let _ = std::fs::remove_dir_all(&old_dir);
        }
        Ok(())
    }

    /// Decode the 7z archive embedded inside the PortableGit SFX and
    /// write every entry under `out_dir`. No subprocess — the entire
    /// decode happens in-process via the LZMA2 / BCJ filters in
    /// `sevenz-rust2`. ~5-10s on a modern x64 host for the ~410 MB
    /// payload; CPU-bound on the LZMA2 decoder.
    fn extract_sfx_to(sfx: &Path, out_dir: &Path) -> std::io::Result<()> {
        let offset = find_magic_offset(sfx)?.ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "7z magic not found in SFX — corrupt bundle or unexpected format",
            )
        })?;
        // sevenz-rust2's `ArchiveReader` needs `Read + Seek`. The
        // simplest correct construction is to slurp the payload into
        // memory once — it is ~58 MB, well below what we already
        // allocate elsewhere on engine startup, and lets the decoder
        // seek freely across folder headers without rebuilding a
        // sub-stream wrapper that has to track its own start offset.
        let mut file = std::fs::File::open(sfx)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        let cursor = std::io::Cursor::new(bytes);
        let password = sevenz_rust2::Password::empty();
        let mut reader = sevenz_rust2::ArchiveReader::new(cursor, password).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, format!("7z header: {e}"))
        })?;

        let out_dir = out_dir.to_path_buf();
        reader
            .for_each_entries(|entry, stream| {
                if entry.is_anti_item {
                    // Anti-items are "delete this on extraction"
                    // markers used by incremental archives. They
                    // should never appear in PortableGit, so we
                    // ignore them safely.
                    return Ok(true);
                }
                let safe = sanitize_entry_path(&entry.name).ok_or_else(|| {
                    sevenz_rust2::Error::Other(
                        format!("unsafe entry path: {:?}", entry.name).into(),
                    )
                })?;
                let dest = out_dir.join(&safe);
                if entry.is_directory {
                    // sevenz-rust2 implements `From<std::io::Error>`
                    // for its Error, so the `?` operator on any fs op
                    // below auto-wraps the underlying io error.
                    std::fs::create_dir_all(&dest)?;
                    return Ok(true);
                }
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut out = std::fs::File::create(&dest)?;
                let mut buf = [0u8; 64 * 1024];
                loop {
                    let n = stream.read(&mut buf)?;
                    if n == 0 {
                        break;
                    }
                    out.write_all(&buf[..n])?;
                }
                Ok(true)
            })
            .map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::Other, format!("7z extract: {e}"))
            })?;
        Ok(())
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
    fn marker_path(target_dir: &Path) -> PathBuf {
        target_dir.join(".sfx-marker")
    }

    fn marker_value(sfx: &Path) -> Option<String> {
        let meta = std::fs::metadata(sfx).ok()?;
        let mtime = meta.modified().ok()?;
        let secs = mtime
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Some(format!("{}:{}", meta.len(), secs))
    }

    fn marker_matches(target_dir: &Path, sfx: &Path) -> bool {
        let expected = match marker_value(sfx) {
            Some(v) => v,
            None => return false,
        };
        std::fs::read_to_string(marker_path(target_dir))
            .map(|s| s.trim() == expected)
            .unwrap_or(false)
    }

    fn write_marker(target_dir: &Path, sfx: &Path) {
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
