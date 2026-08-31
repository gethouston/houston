//! CPU capability gate for the bundled `whisper-cli` sidecar.
//!
//! The Windows and Linux x86-64 whisper-cli builds carry a Haswell-era (2013+)
//! instruction baseline — AVX2/FMA/F16C/BMI2, pinned in
//! `scripts/build-whisper.sh`. On an older x86-64 CPU the child dies instantly
//! with an illegal-instruction fault (`0xc000001d` on Windows), which read to
//! the user as an unexplained "didn't work, try again" toast they retried in
//! vain. Detect the gap BEFORE offering the 181 MB model download or spawning
//! the sidecar, so the frontend can show honest "this computer can't run voice
//! typing" copy instead (same pattern as `crate::claude_login`'s helper gate).
//!
//! macOS is exempt on both arches: the x86_64 slice is cross-compiled
//! (arm64 runner via CMAKE_OSX_ARCHITECTURES), which builds ggml's portable
//! baseline kernels, so pre-AVX2 Intel Macs run it fine.

/// Whether the bundled whisper-cli can execute on this machine's CPU.
pub(super) fn cpu_supported() -> bool {
    #[cfg(all(target_arch = "x86_64", not(target_os = "macos")))]
    {
        // AVX2 implies the rest of the pinned baseline (FMA/F16C/BMI2 all
        // arrived with Haswell), so one probe covers it.
        std::arch::is_x86_feature_detected!("avx2")
    }
    #[cfg(not(all(target_arch = "x86_64", not(target_os = "macos"))))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_supported_on_capable_hardware() {
        // Every CI/dev host (Apple Silicon, AVX2-era x86-64) can run the
        // sidecar; a pre-AVX2 x86-64 has no CI representation, so this pins
        // the common-path contract instead: no false positives that would
        // hide voice typing from capable machines.
        assert!(cpu_supported());
    }
}
