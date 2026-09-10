//! A uniquely-named temp WAV whose file is removed when the handle drops,
//! regardless of how the transcription returns.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Monotonic suffix so concurrent transcriptions never collide on a temp path.
static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

pub struct TempWav {
    path: PathBuf,
}

impl TempWav {
    pub fn write(bytes: &[u8]) -> Result<Self, String> {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "houston-dictation-{}-{seq}-{nanos}.wav",
            std::process::id()
        ));
        std::fs::write(&path, bytes)
            .map_err(|e| format!("dictation: write temp wav {}: {e}", path.display()))?;
        Ok(Self { path })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempWav {
    fn drop(&mut self) {
        if let Err(e) = std::fs::remove_file(&self.path) {
            tracing::debug!("dictation: temp wav cleanup failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_wav_written_then_removed_on_drop() {
        let path;
        {
            let wav = TempWav::write(b"RIFFdata").unwrap();
            path = wav.path().to_path_buf();
            assert_eq!(std::fs::read(&path).unwrap(), b"RIFFdata");
        }
        assert!(!path.exists(), "temp wav removed when handle drops");
    }
}
