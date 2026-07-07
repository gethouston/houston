//! Pure helpers for deriving a transcription timeout from a recorded WAV, plus
//! the worker-thread clamp. No I/O — all unit-testable without the sidecar.

use std::time::Duration;

/// Bytes/second for the recorder's format (16 kHz mono 16-bit PCM): the
/// fallback rate when a WAV header can't be parsed.
const FALLBACK_BYTE_RATE: u64 = 16_000 * 2;

/// The floor a transcription is always allowed, regardless of clip length.
const MIN_TIMEOUT_SECS: u64 = 30;

/// Estimated audio duration, in seconds, from the raw WAV bytes.
///
/// Parses the RIFF/`fmt `/`data` chunks to read the real byte rate and sample
/// data size; on any malformed/short header it falls back to dividing the whole
/// buffer by the recorder's known byte rate. Never panics.
pub fn duration_secs(bytes: &[u8]) -> f64 {
    if let Some(d) = parse_duration(bytes) {
        return d;
    }
    (bytes.len() as f64) / (FALLBACK_BYTE_RATE as f64)
}

fn parse_duration(bytes: &[u8]) -> Option<f64> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut byte_rate: Option<u32> = None;
    let mut data_size: Option<u32> = None;
    // Walk chunks: [4-byte id][4-byte LE size][size bytes of body].
    let mut pos = 12usize;
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = pos + 8;
        match id {
            b"fmt " if body + 16 <= bytes.len() => {
                // fmt layout: format(2) channels(2) sampleRate(4) byteRate(4)...
                byte_rate = Some(u32::from_le_bytes(
                    bytes[body + 8..body + 12].try_into().ok()?,
                ));
            }
            b"data" => data_size = Some(size as u32),
            _ => {}
        }
        // Chunk bodies are word-aligned: odd sizes carry a pad byte.
        pos = body + size + (size & 1);
    }
    let rate = byte_rate.filter(|r| *r > 0)?;
    let data = data_size?;
    Some((data as f64) / (rate as f64))
}

/// Timeout for one transcription: `max(30s, 4 × audio duration)`.
pub fn transcription_timeout(duration_secs: f64) -> Duration {
    let scaled = (duration_secs * 4.0).ceil().max(0.0);
    let secs = (scaled as u64).max(MIN_TIMEOUT_SECS);
    Duration::from_secs(secs)
}

/// whisper worker threads: available parallelism clamped to `1..=8`.
pub fn clamp_threads(available: usize) -> usize {
    available.clamp(1, 8)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal but valid 16 kHz mono 16-bit PCM WAV header wrapping
    /// `data_len` bytes of (absent) sample data.
    fn synthetic_header(data_len: u32) -> Vec<u8> {
        let byte_rate: u32 = 16_000 * 2;
        let mut w = Vec::new();
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&(36 + data_len).to_le_bytes());
        w.extend_from_slice(b"WAVE");
        w.extend_from_slice(b"fmt ");
        w.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
        w.extend_from_slice(&1u16.to_le_bytes()); // PCM
        w.extend_from_slice(&1u16.to_le_bytes()); // mono
        w.extend_from_slice(&16_000u32.to_le_bytes()); // sample rate
        w.extend_from_slice(&byte_rate.to_le_bytes());
        w.extend_from_slice(&2u16.to_le_bytes()); // block align
        w.extend_from_slice(&16u16.to_le_bytes()); // bits/sample
        w.extend_from_slice(b"data");
        w.extend_from_slice(&data_len.to_le_bytes());
        w
    }

    #[test]
    fn duration_parsed_from_header() {
        // 2 seconds of audio = byte_rate * 2 = 64000 data bytes.
        let wav = synthetic_header(64_000);
        assert!((duration_secs(&wav) - 2.0).abs() < 1e-6);
    }

    #[test]
    fn duration_falls_back_when_header_garbage() {
        // Not a RIFF/WAVE buffer: divide whole length by the fallback rate.
        let junk = vec![0u8; 32_000];
        assert!((duration_secs(&junk) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn timeout_honors_30s_floor() {
        // A 1s clip → 4s, floored up to the 30s minimum.
        assert_eq!(transcription_timeout(1.0), Duration::from_secs(30));
        assert_eq!(transcription_timeout(0.0), Duration::from_secs(30));
    }

    #[test]
    fn timeout_scales_4x_past_floor() {
        // A 60s clip → 240s dominates the floor.
        assert_eq!(transcription_timeout(60.0), Duration::from_secs(240));
    }

    #[test]
    fn threads_clamped_to_1_8() {
        assert_eq!(clamp_threads(0), 1);
        assert_eq!(clamp_threads(1), 1);
        assert_eq!(clamp_threads(4), 4);
        assert_eq!(clamp_threads(32), 8);
    }
}
