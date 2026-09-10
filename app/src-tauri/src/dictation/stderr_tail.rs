//! The last few KiB of a sidecar's stderr, kept so a crash carries its own
//! evidence.
//!
//! whisper-cli reports every failure on stderr and nowhere else: a
//! `GGML_ASSERT` prints `file:line: condition` plus a backtrace before
//! `abort()`, the ggml terminate handler prints the uncaught exception, and a
//! refused model load prints the loader's reason. On Windows `abort()`
//! surfaces to the parent only as exit status `0xc0000409`
//! (STATUS_STACK_BUFFER_OVERRUN via `__fastfail`), which names nothing. The
//! shell used to route stderr to NUL, so the Sentry event for that exit
//! (PRODUCT-1731) was a bare status code. The tail is bounded because model
//! loading alone logs dozens of lines and an unbounded buffer would grow with
//! the clip; the crash site is always at the END of stderr.

use std::collections::VecDeque;
use std::io::Read;

/// Bytes of stderr retained. Enough for a ggml assert + backtrace, small
/// enough to ride a Sentry event as `extra` without truncation.
pub const STDERR_TAIL_BYTES: usize = 4096;

/// A fixed-capacity byte window over the end of a stream.
pub struct TailBuffer {
    cap: usize,
    bytes: VecDeque<u8>,
}

impl TailBuffer {
    pub fn new(cap: usize) -> Self {
        Self {
            cap,
            bytes: VecDeque::with_capacity(cap),
        }
    }

    /// Append, evicting from the front so at most `cap` bytes remain.
    pub fn push(&mut self, chunk: &[u8]) {
        let keep = chunk.len().min(self.cap);
        let incoming = &chunk[chunk.len() - keep..];
        let overflow = (self.bytes.len() + incoming.len()).saturating_sub(self.cap);
        self.bytes.drain(..overflow);
        self.bytes.extend(incoming);
    }

    /// The retained bytes as trimmed text. A window cut mid-codepoint yields a
    /// replacement char at the start, never a decode failure.
    pub fn into_string(self) -> String {
        let bytes: Vec<u8> = self.bytes.into_iter().collect();
        String::from_utf8_lossy(&bytes).trim().to_string()
    }
}

/// Drain `reader` to EOF, keeping only the last [`STDERR_TAIL_BYTES`]. Read
/// errors end the drain with whatever was retained: the tail is diagnostic
/// context, never the reason a transcription fails.
pub fn drain_tail<R: Read>(mut reader: R) -> String {
    let mut tail = TailBuffer::new(STDERR_TAIL_BYTES);
    let mut buf = [0u8; 1024];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => tail.push(&buf[..n]),
        }
    }
    tail.into_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_everything_under_capacity() {
        let mut tail = TailBuffer::new(16);
        tail.push(b"hello ");
        tail.push(b"world");
        assert_eq!(tail.into_string(), "hello world");
    }

    #[test]
    fn keeps_only_the_last_cap_bytes_across_pushes() {
        let mut tail = TailBuffer::new(8);
        tail.push(b"abcdef");
        tail.push(b"ghijkl");
        assert_eq!(tail.into_string(), "efghijkl");
    }

    #[test]
    fn a_single_oversized_chunk_keeps_its_end() {
        let mut tail = TailBuffer::new(4);
        tail.push(b"0123456789");
        assert_eq!(tail.into_string(), "6789");
    }

    #[test]
    fn drain_tail_returns_the_end_of_a_long_stream() {
        let noise = "whisper_model_load: loading model\n".repeat(400);
        let crash = "ggml.c:123: GGML_ASSERT(rc == 0) failed\n";
        let stream = format!("{noise}{crash}");
        let tail = drain_tail(stream.as_bytes());
        assert!(tail.len() <= STDERR_TAIL_BYTES);
        assert!(
            tail.ends_with("GGML_ASSERT(rc == 0) failed"),
            "tail: {tail}"
        );
    }

    #[test]
    fn drain_tail_of_empty_stream_is_empty() {
        assert_eq!(drain_tail(&b""[..]), "");
    }

    #[test]
    fn mid_codepoint_cut_never_fails() {
        let mut tail = TailBuffer::new(3);
        tail.push("ñx".as_bytes()); // ñ is 2 bytes; cap 3 keeps all
        assert_eq!(tail.into_string(), "ñx");
        let mut cut = TailBuffer::new(2);
        cut.push("ñx".as_bytes()); // keeps the 2nd byte of ñ + 'x'
        assert_eq!(cut.into_string(), "\u{FFFD}x");
    }
}
