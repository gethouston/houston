//! On-device dictation via a bundled whisper.cpp sidecar.
//!
//! Three Tauri commands power the desktop's push-to-talk transcription:
//!   - [`transcribe_audio`] runs `whisper-cli` over a recorded WAV and returns
//!     the recognized text (raw audio rides the IPC payload, not JSON).
//!   - [`dictation_model_status`] reports whether the pinned model is on disk.
//!   - [`download_dictation_model`] fetches + sha256-verifies that model.
//!
//! The model is downloaded once into the app data dir; the sidecar binary is
//! staged by Tauri's `externalBin` and resolved via [`crate::child_guard`],
//! sharing the same orphan-prevention discipline as the engine/frpc sidecars.

mod model;
mod types;
mod verify;
mod wav;
mod whisper;

// Glob re-exports so `tauri::generate_handler!` in `lib.rs` can reach both each
// command AND the hidden `__cmd__*` items the `#[tauri::command]` macro emits
// alongside it (a named `pub use` would leave those behind). The wire types in
// `types` are used by these commands' signatures and serialized to the frontend
// as JSON, so they need no path-level re-export here.
pub use model::*;
pub use whisper::*;
