//! Workspace-scoped local mirror of evidence files attached to a Beltic
//! credential.
//!
//! Houston hashes attached identity documents in the renderer (SHA-256 via
//! `crypto.subtle`) and submits opaque `sha256:<hex>:<doctype>:<filename>`
//! refs in the credential's `evidence_refs[]`. The actual bytes never leave
//! the user's machine until the Beltic `/v1/evidence` endpoint ships
//! (beltichq/platform PR #179 follow-up). To keep a complete audit trail
//! locally, we content-address each attachment at
//!   `<workspace_root>/.houston/identity/evidence/<sha256>.<ext>`
//! during the issuance flow. The credential's `evidence_refs[]` survives
//! as the index from the signed JWT to these files.
//!
//! On Unix the files are written with mode `0600` (owner-only).

use std::path::{Path, PathBuf};

use crate::agents::store::ensure_houston_dir;
use crate::error::{CoreError, CoreResult};

const SUBDIR: &str = "identity/evidence";

/// Extension to use for a given content-type. Mirrors the Beltic
/// `EvidenceStorageService` table so files round-trip identically on
/// both sides.
fn extension_for(content_type: &str) -> &'static str {
    match content_type.to_ascii_lowercase().as_str() {
        "application/pdf" => "pdf",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/tiff" => "tiff",
        "image/heic" => "heic",
        "image/heif" => "heif",
        _ => "bin",
    }
}

/// Validate that a SHA-256 hex string is well-formed before letting it
/// participate in a filename — prevents path traversal via crafted
/// `sha256` query params (`../../etc/passwd.pdf`).
fn validate_sha256(sha256: &str) -> CoreResult<()> {
    if sha256.len() != 64 {
        return Err(CoreError::BadRequest(
            "sha256 must be exactly 64 hex chars".into(),
        ));
    }
    if !sha256.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
        return Err(CoreError::BadRequest(
            "sha256 must be lowercase hex".into(),
        ));
    }
    Ok(())
}

/// Returns the absolute path the file would be saved at, without
/// touching disk. Useful for the route handler to surface in its
/// response.
pub fn build_path(
    workspace_root: &Path,
    sha256: &str,
    content_type: &str,
) -> CoreResult<PathBuf> {
    validate_sha256(sha256)?;
    Ok(workspace_root
        .join(".houston")
        .join(SUBDIR)
        .join(format!("{sha256}.{ext}", ext = extension_for(content_type))))
}

/// Persist `bytes` to disk. Idempotent — same sha256 + content_type
/// re-uploads are a no-op (last-writer-wins; bytes are content-
/// addressed by the caller). On Unix sets mode 0600.
pub fn save(
    workspace_root: &Path,
    sha256: &str,
    content_type: &str,
    bytes: &[u8],
) -> CoreResult<PathBuf> {
    let path = build_path(workspace_root, sha256, content_type)?;
    ensure_houston_dir(workspace_root)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            CoreError::Internal(format!("create evidence dir {}: {e}", parent.display()))
        })?;
    }
    std::fs::write(&path, bytes).map_err(|e| {
        CoreError::Internal(format!("write evidence {}: {e}", path.display()))
    })?;
    set_owner_only(&path)?;
    Ok(path)
}

/// Verify the file exists on disk for a given sha256 + content_type.
/// Returns the path if found; None otherwise.
pub fn locate(
    workspace_root: &Path,
    sha256: &str,
    content_type: &str,
) -> CoreResult<Option<PathBuf>> {
    let path = build_path(workspace_root, sha256, content_type)?;
    Ok(if path.exists() { Some(path) } else { None })
}

#[cfg(unix)]
fn set_owner_only(path: &Path) -> CoreResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, perms).map_err(|e| {
        CoreError::Internal(format!("chmod 0600 on evidence file: {e}"))
    })?;
    Ok(())
}

#[cfg(not(unix))]
fn set_owner_only(_path: &Path) -> CoreResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sha() -> String {
        "abcd1234".repeat(8) // 64 hex chars
    }

    #[test]
    fn save_then_locate_round_trips() {
        let tmp = TempDir::new().unwrap();
        let path = save(tmp.path(), &sha(), "application/pdf", b"%PDF-1.4\n").unwrap();
        assert!(path.ends_with("identity/evidence").to_string().is_empty() == false);
        assert!(path.to_string_lossy().ends_with(".pdf"));
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes, b"%PDF-1.4\n");
        let found = locate(tmp.path(), &sha(), "application/pdf").unwrap().unwrap();
        assert_eq!(found, path);
    }

    #[test]
    fn build_path_validates_sha256_length() {
        let tmp = TempDir::new().unwrap();
        let err = build_path(tmp.path(), "tooshort", "application/pdf").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn build_path_validates_sha256_alphabet() {
        let tmp = TempDir::new().unwrap();
        // 64 chars but uppercase A → rejected
        let bad = "A".repeat(64);
        let err = build_path(tmp.path(), &bad, "application/pdf").unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn build_path_rejects_path_traversal_via_sha256() {
        let tmp = TempDir::new().unwrap();
        // Crafted "sha256" containing `..` — invalid hex catches it
        let bad = "..".repeat(32); // 64 chars but with `.` not a hex digit
        assert!(build_path(tmp.path(), &bad, "application/pdf").is_err());
    }

    #[test]
    fn save_overwrites_prior_bytes_for_same_address() {
        let tmp = TempDir::new().unwrap();
        save(tmp.path(), &sha(), "application/pdf", b"first").unwrap();
        save(tmp.path(), &sha(), "application/pdf", b"second").unwrap();
        let path = locate(tmp.path(), &sha(), "application/pdf").unwrap().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"second");
    }

    #[cfg(unix)]
    #[test]
    fn saved_file_is_mode_0600() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new().unwrap();
        let path = save(tmp.path(), &sha(), "image/png", &[0x89, b'P', b'N', b'G']).unwrap();
        let meta = std::fs::metadata(&path).unwrap();
        let mode = meta.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn unknown_content_type_falls_back_to_bin_extension() {
        let path = build_path(
            &Path::new("/tmp"),
            &sha(),
            "application/x-mystery",
        )
        .unwrap();
        assert!(path.to_string_lossy().ends_with(".bin"));
    }

    #[test]
    fn locate_returns_none_when_file_missing() {
        let tmp = TempDir::new().unwrap();
        let none = locate(tmp.path(), &sha(), "application/pdf").unwrap();
        assert!(none.is_none());
    }
}
