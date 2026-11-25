//! The typed failure the shell's file commands (`save_file.rs`, the reveal
//! in `os.rs`) reject with, and the write helper that keeps a locked
//! destination from failing at all.
//!
//! Before PRODUCT-1732 these commands rejected with the raw OS string, in
//! the OS language ("El proceso no tiene acceso al archivo porque está
//! siendo utilizado por otro proceso. (os error 32)"), and the frontend
//! filed every one as a Sentry bug. They are user states with a remedy:
//! the destination is open in Excel, the folder is protected, the disk is
//! full, the chosen folder is gone. The frontend classifies `kind`
//! (`app/src/lib/file-op-failure.ts`) into authored expected-state copy;
//! only `other` is still reported.

use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileOpFailureKind {
    /// Windows sharing violation: another program holds the file open.
    Locked,
    /// The OS refused the path (protected folder, read-only file, a policy
    /// that blocks spawning Explorer).
    Permission,
    DiskFull,
    /// The chosen folder no longer exists (os error 3 / 2): an unplugged or
    /// offline drive, a folder deleted while the dialog was open. Only
    /// `write_with_fallback` mints it, after checking the folder is gone.
    NotFound,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileOpFailure {
    pub kind: FileOpFailureKind,
    /// The raw diagnostic, still in the OS language; it reaches the
    /// frontend log and, for `Other`, Sentry. Never shown to the user.
    pub message: String,
}

impl FileOpFailure {
    pub fn other(message: impl Into<String>) -> Self {
        Self {
            kind: FileOpFailureKind::Other,
            message: message.into(),
        }
    }

    pub fn from_io(context: &str, err: &io::Error) -> Self {
        Self {
            kind: classify(err),
            message: format!("{context}: {err}"),
        }
    }
}

// WHY: Only Windows locks open files against writers; on Unix code 32 is EPIPE. ADR-0105
#[cfg(windows)]
const SHARING_CODES: &[i32] = &[32, 33];
#[cfg(not(windows))]
const SHARING_CODES: &[i32] = &[];

fn classify(err: &io::Error) -> FileOpFailureKind {
    if err
        .raw_os_error()
        .is_some_and(|c| SHARING_CODES.contains(&c))
    {
        return FileOpFailureKind::Locked;
    }
    match err.kind() {
        io::ErrorKind::PermissionDenied => FileOpFailureKind::Permission,
        io::ErrorKind::StorageFull => FileOpFailureKind::DiskFull,
        _ => FileOpFailureKind::Other,
    }
}

/// The first `name (n).ext` sibling of `target` that does not exist yet,
/// the way a browser download dedupes. `target` itself when it is free.
pub fn free_sibling(target: &Path) -> PathBuf {
    if !target.exists() {
        return target.to_path_buf();
    }
    let dir = target.parent().map(Path::to_path_buf).unwrap_or_default();
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "download".to_string());
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.clone(), String::new()),
    };
    (2u32..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("some free filename exists")
}

/// Where a write actually landed. `renamed_from` is the original file name
/// when the destination was locked and the bytes went to a free sibling.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrittenFile {
    pub path: String,
    pub file_name: String,
    pub renamed_from: Option<String>,
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Write `bytes` to `target`; when the target exists and the OS refuses to
/// overwrite it (open in another program, read-only), write to the next free
/// sibling instead and say so. A protected FOLDER still fails, typed.
///
/// The dialog already asked the user to confirm the overwrite, so the first
/// attempt is the path they chose; only the OS refusal changes the name.
pub async fn write_with_fallback(
    target: &Path,
    bytes: &[u8],
) -> Result<WrittenFile, FileOpFailure> {
    let first = match tokio::fs::write(target, bytes).await {
        Ok(()) => {
            return Ok(WrittenFile {
                path: target.to_string_lossy().into_owned(),
                file_name: file_name_of(target),
                renamed_from: None,
            });
        }
        Err(err) => err,
    };
    let refused_existing = match classify(&first) {
        FileOpFailureKind::Locked => true,
        FileOpFailureKind::Permission => target.exists(),
        _ => false,
    };
    if !refused_existing {
        let mut failure = FileOpFailure::from_io("Failed to save file", &first);
        if first.kind() == io::ErrorKind::NotFound && parent_is_gone(target).await {
            failure.kind = FileOpFailureKind::NotFound;
        }
        return Err(failure);
    }
    let sibling = free_sibling(target);
    tokio::fs::write(&sibling, bytes).await.map_err(|err| {
        FileOpFailure::from_io("Failed to save file (retry beside a locked file)", &err)
    })?;
    Ok(WrittenFile {
        path: sibling.to_string_lossy().into_owned(),
        file_name: file_name_of(&sibling),
        renamed_from: Some(file_name_of(target)),
    })
}

/// Whether `target`'s folder no longer exists. A NotFound with the folder
/// still present (a filter driver, Controlled Folder Access, a OneDrive
/// placeholder refusing the create) is not the user's state to fix, so it
/// stays `Other` and reports.
async fn parent_is_gone(target: &Path) -> bool {
    match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => {
            !tokio::fs::try_exists(parent).await.unwrap_or(true)
        }
        _ => false,
    }
}

/// Where a dialog-less save lands: a free name inside `dir`, the OS download
/// folder, created first. The `not_found` copy tells the person to pick a
/// folder "like Downloads", so a missing Downloads folder must never reach
/// it: create it, and a failure to is a bug that reports as `Other`.
#[cfg_attr(any(target_os = "macos", target_os = "windows"), allow(dead_code))]
pub async fn prepare_download_target(dir: &Path, name: &str) -> Result<PathBuf, FileOpFailure> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|err| FileOpFailure {
            kind: FileOpFailureKind::Other,
            message: format!("Failed to create the download folder: {err}"),
        })?;
    Ok(free_sibling(&dir.join(name)))
}

#[cfg(test)]
#[path = "file_failure_tests.rs"]
mod tests;
