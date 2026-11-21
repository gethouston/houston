//! The partials directory around `update_partial`: file naming, the sidecar
//! read, the best-effort sweeps, and the per-file in-flight registry.
//!
//! Nothing here may fail an update: a sweep that cannot remove a neighbour
//! logs and moves on, and only the download's own files are ever an error.

use super::update_partial::Sidecar;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};

/// The suffix every atomic write in the repo gives its temp file
/// (`ATOMIC_TMP_SUFFIX` in `@houston/protocol`): a half-written sidecar is
/// never read as one.
pub const ATOMIC_TMP_SUFFIX: &str = ".houston.tmp";
pub const PART_SUFFIX: &str = ".part";
pub const SIDECAR_SUFFIX: &str = ".part.json";

/// A partial nobody has touched for this long was abandoned: the release it
/// belongs to was skipped, or the client moved on without finishing it.
pub const ABANDONED_AFTER: Duration = Duration::from_secs(7 * 24 * 60 * 60);

pub fn file_stem(version: &str) -> String {
    version
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn remove_if_present(path: &Path) -> io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// The version stem a partial-family file name belongs to. A leftover
/// sidecar temp file never strips down to a bare version, so it reads as
/// belonging to no version and every sweep removes it.
fn stem_of(name: &str) -> Option<&str> {
    name.strip_suffix(SIDECAR_SUFFIX)
        .or_else(|| name.strip_suffix(PART_SUFFIX))
        .or_else(|| name.strip_suffix(ATOMIC_TMP_SUFFIX))
}

/// Remove every partial-family file in `dir` for which `doomed` says so.
/// Best effort: a neighbour that will not go is logged, never an error.
fn sweep(dir: &Path, doomed: impl Fn(&str, &std::fs::Metadata) -> bool) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return,
        Err(e) => {
            tracing::warn!("[updater] list partial downloads in {}: {e}", dir.display());
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(stem) = stem_of(name) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let held = InFlightClaim::holds(&dir.join(format!("{stem}{PART_SUFFIX}")));
        if !held && doomed(stem, &metadata) {
            if let Err(e) = remove_if_present(&path) {
                tracing::warn!("[updater] remove stale partial {}: {e}", path.display());
            }
        }
    }
}

/// Drop the partials of every OTHER version: a newer release supersedes
/// whatever was half-downloaded of the one before it.
pub fn prune_others(dir: &Path, keep: &str) {
    sweep(dir, |stem, _| stem != keep);
}

/// At startup: drop the partial of the version now RUNNING (it installed
/// some other way) and anything untouched for `ABANDONED_AFTER`.
pub fn prune_abandoned(dir: &Path, running_version: &str, now: SystemTime) {
    let running = file_stem(running_version);
    sweep(dir, |stem, metadata| {
        let idle = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|idle| idle >= ABANDONED_AFTER);
        stem == running || idle
    });
}

/// `Ok(None)` for a path that is not there; any other read error is logged
/// and reads as "not there" too, so a bad disk never fails the update here.
pub fn read_if_present(path: &Path) -> Option<Vec<u8>> {
    match std::fs::read(path) {
        Ok(raw) => Some(raw),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => {
            tracing::warn!("[updater] read {}: {e}", path.display());
            None
        }
    }
}

/// The length of the file at `path`, `None` when it is not there (any other
/// error is logged and reads as "not there").
pub fn len_if_present(path: &Path) -> Option<u64> {
    match std::fs::metadata(path) {
        Ok(metadata) => Some(metadata.len()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => {
            tracing::warn!("[updater] stat {}: {e}", path.display());
            None
        }
    }
}

/// The sidecar, or `None` when there is none or it does not parse (logged:
/// a sidecar we wrote should always parse, so that is worth a look).
pub fn read_sidecar(path: &Path) -> Option<Sidecar> {
    let raw = read_if_present(path)?;
    match serde_json::from_slice(&raw) {
        Ok(sidecar) => Some(sidecar),
        Err(e) => {
            tracing::warn!(
                "[updater] partial sidecar {} unreadable: {e}",
                path.display()
            );
            None
        }
    }
}

/// The partial files open in this process. Two downloads of one version
/// (the updater hook remounts across the mobile breakpoint, on identity
/// change and on reload while the shell's download keeps running) would
/// otherwise both append to one file and fail its signature.
static IN_FLIGHT: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

fn in_flight() -> MutexGuard<'static, Vec<PathBuf>> {
    IN_FLIGHT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Exclusive hold on one partial path for as long as it lives.
pub struct InFlightClaim(PathBuf);

impl InFlightClaim {
    /// Whether some download in this process holds `path` right now.
    pub fn holds(path: &Path) -> bool {
        in_flight().iter().any(|p| p == path)
    }

    /// `None` when another download holds the same path right now.
    pub fn take(path: &Path) -> Option<Self> {
        let mut held = in_flight();
        if held.iter().any(|p| p == path) {
            return None;
        }
        held.push(path.to_path_buf());
        Some(Self(path.to_path_buf()))
    }
}

impl Drop for InFlightClaim {
    fn drop(&mut self) {
        in_flight().retain(|p| p != &self.0);
    }
}
