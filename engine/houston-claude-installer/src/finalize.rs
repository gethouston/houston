//! Stage 5 of the install pipeline: chmod +x then atomic rename.
//!
//! Kept in its own module so `download.rs` stays under the CLAUDE.md
//! §"File size limits" cap. The boundary is meaningful: this is the
//! "publish the verified binary into the install target" step. Earlier
//! stages stream and verify; this stage flips the bit that makes the
//! binary spawnable and atomically replaces any prior install.

use std::path::Path;

use crate::error::install_err;

/// Mark the temp file executable (Unix) and atomically rename it into
/// the final install target. On Windows the rename is preceded by a
/// best-effort cleanup of the existing target so `rename` doesn't fail
/// with "destination exists".
///
/// On error returns the same `install_err`-shaped string as every other
/// fatal in the pipeline (CLAUDE.md "No silent failures" — surfaces
/// verbatim as the user's toast).
pub(crate) fn chmod_and_atomic_rename(
    tmp_path: &Path,
    final_path: &Path,
    version: &str,
    url: &str,
    target_display: &str,
) -> Result<(), String> {
    // Make the binary executable BEFORE the rename so a racing reader
    // never sees a non-executable file at the install target.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(tmp_path, perms).map_err(|e| {
            install_err(
                &format!("chmod +x {}", tmp_path.display()),
                version,
                url,
                target_display,
                None,
                &e,
            )
        })?;
    }

    // Atomic rename within the same dir. On Unix this is a syscall;
    // on Windows we have to remove the existing target first because
    // `rename` fails if the destination exists.
    #[cfg(windows)]
    {
        if final_path.exists() {
            // allow-silent-failure: a failure here is benign because
            // the immediately-following `rename` will surface the real
            // "destination exists" error with full context (via the
            // install_err wrapper) if cleanup actually failed.
            let _ = std::fs::remove_file(final_path);
        }
    }
    std::fs::rename(tmp_path, final_path)
        .map_err(|e| install_err("install rename", version, url, target_display, None, &e))?;

    Ok(())
}
