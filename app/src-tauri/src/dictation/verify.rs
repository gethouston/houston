//! Checksum + atomic-finalize primitives for the model download: hex encoding,
//! the sha256 gate that moves a `.part` into place, and the RAII guard that
//! removes a partial file on a failed download.

use std::path::{Path, PathBuf};

/// Lowercase hex encoding of a digest.
pub fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Compare digests and, on a match, atomically move `part` into place. On a
/// mismatch the partial file is removed and an Err returned — a corrupt blob
/// never lands at the final path.
pub fn verify_and_finalize(
    part: &Path,
    final_path: &Path,
    actual_hex: &str,
    expected_hex: &str,
) -> Result<(), String> {
    if !actual_hex.eq_ignore_ascii_case(expected_hex) {
        std::fs::remove_file(part)
            .map_err(|e| format!("dictation: remove corrupt {}: {e}", part.display()))?;
        return Err(format!(
            "dictation: model checksum mismatch (expected {expected_hex}, got {actual_hex})"
        ));
    }
    std::fs::rename(part, final_path)
        .map_err(|e| format!("dictation: finalize {}: {e}", final_path.display()))
}

/// Removes a `.part` file on drop unless [`disarm`](PartGuard::disarm)ed, so a
/// failed download never leaves a stray partial behind.
pub struct PartGuard {
    path: PathBuf,
    armed: bool,
}

impl PartGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }
    pub fn disarm(mut self) {
        self.armed = false;
    }
}

impl Drop for PartGuard {
    fn drop(&mut self) {
        if self.armed && self.path.exists() {
            if let Err(e) = std::fs::remove_file(&self.path) {
                tracing::debug!("dictation: cleanup of {} failed: {e}", self.path.display());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn hex_of_known_input() {
        // sha256("") — a fixed vector anchoring the hex encoder + digest wiring.
        assert_eq!(
            hex(&Sha256::digest(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn finalize_renames_on_match() {
        let dir = std::env::temp_dir().join(format!("dict-fin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("m.part");
        let final_path = dir.join("m.bin");
        std::fs::write(&part, b"hello").unwrap();
        let actual = hex(&Sha256::digest(b"hello"));

        verify_and_finalize(&part, &final_path, &actual, &actual).unwrap();
        assert!(!part.exists(), "part removed after rename");
        assert_eq!(std::fs::read(&final_path).unwrap(), b"hello");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finalize_rejects_mismatch_and_removes_part() {
        let dir = std::env::temp_dir().join(format!("dict-mis-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("m.part");
        let final_path = dir.join("m.bin");
        std::fs::write(&part, b"corrupt").unwrap();

        let err = verify_and_finalize(&part, &final_path, "deadbeef", "cafe").unwrap_err();
        assert!(err.contains("checksum mismatch"));
        assert!(!part.exists(), "corrupt part removed");
        assert!(!final_path.exists(), "nothing landed at the final path");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn part_guard_removes_on_drop_but_not_after_disarm() {
        let dir = std::env::temp_dir().join(format!("dict-guard-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let armed = dir.join("armed.part");
        std::fs::write(&armed, b"x").unwrap();
        drop(PartGuard::new(armed.clone()));
        assert!(!armed.exists(), "armed guard removes the part on drop");

        let kept = dir.join("kept.part");
        std::fs::write(&kept, b"x").unwrap();
        PartGuard::new(kept.clone()).disarm();
        assert!(kept.exists(), "disarmed guard leaves the file");

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
