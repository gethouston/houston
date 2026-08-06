//! CPU capability gate for the bundled Claude Code helper.
//!
//! The `claude` sidecar is a Bun-compiled binary, and Bun's x86-64 builds
//! require AVX2 (Haswell, 2013+). On an older x86-64 machine (e.g. a 2012
//! MacBookPro10,1 — Ivy Bridge) the child dies instantly with SIGILL and an
//! empty stderr, which surfaced as an inscrutable "Claude sign-in failed
//! (exit signal)" toast the user retried in vain (HOUSTON-APP-543). Detect
//! the gap BEFORE spawning so the frontend can route a remote-engine login to
//! the runtime's paste flow — which needs no local helper — instead of
//! burning the attempt.

/// Why the bundled helper cannot run on this machine, or `None` when it can.
/// The string is diagnostic (logs/Sentry); the frontend shows translated copy.
pub(super) fn unsupported_reason() -> Option<String> {
    #[cfg(target_arch = "x86_64")]
    {
        if !std::arch::is_x86_feature_detected!("avx2") {
            return Some(
                "the Claude sign-in helper needs an x86-64 CPU with AVX2 (2013 or newer) \
                 and this machine's CPU predates it"
                    .to_string(),
            );
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_reason_is_none_on_supported_hardware() {
        // Every CI/dev host (Apple Silicon, AVX2-era x86-64) can run the
        // helper; the interesting arm — a pre-AVX2 x86-64 — has no CI
        // representation, so this pins the common-path contract instead:
        // no false positives that would dump capable machines into the
        // paste flow.
        assert_eq!(unsupported_reason(), None);
    }
}
