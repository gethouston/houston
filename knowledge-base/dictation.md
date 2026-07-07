# Dictation (desktop-only voice typing)

Push-to-talk voice typing in the chat composer. Desktop only — no cloud
round-trip, no mic access on web (the mic control is absent entirely there).

## Architecture

- **Sidecar**: `whisper.cpp`'s `whisper-cli` (v1.9.1, MIT), built per-target by
  `scripts/build-whisper.sh` and staged by `app/src-tauri/build.rs`
  (`stage_whisper_sidecar`) like `frpc` and the host sidecar — Tauri
  `externalBin`, staged as `binaries/whisper-cli-<triple>`. Built fully static
  (no shared-lib dependency); macOS Metal is embedded in the binary.
- **Model**: `ggml-small-q5_1` (~181 MB, sha256-pinned in
  `app/src-tauri/src/dictation/model.rs`), downloaded once into the app data
  dir (`<app_data_dir>/models/whisper/ggml-small-q5_1.bin`) on first use.
  Streams to a `.part` sibling, hashing as it goes, and only renames into
  place once the digest matches — a truncated/corrupted fetch can never
  masquerade as ready.
- **Tauri commands** (`app/src-tauri/src/dictation/`): `transcribe_audio`
  (raw-WAV over the IPC payload as `InvokeBody::Raw` — JSON-encoding a
  multi-megabyte clip would freeze the webview, same reasoning as
  `commands::save_file`; the language hint rides the `x-dictation-lang`
  header), `dictation_model_status`, `download_dictation_model`. The sidecar
  child gets the same orphan-prevention discipline as the engine/frpc
  sidecars (Unix process group + `killpg`, Windows Job Object).
- **Capture** (`app/src/lib/dictation/`): `getUserMedia` → an `AudioContext`
  pinned to 16 kHz → an `AudioWorklet` posting raw Float32 frames to the main
  thread → accumulate → resample if the platform ignored the requested rate →
  encode as WAV. Deliberately **not** `MediaRecorder` — WKWebView's
  `MediaRecorder` only emits AAC, no PCM/Opus container whisper can consume.
  Auto-stops at 120s.
- **UI**: `ui/chat` exposes a prop-driven `DictationControl` contract
  (`ui/chat/src/dictation-types.ts`) — the library renders mic /
  recording / transcribing states, all capture and transcription logic stays
  in the app. `control === undefined` → mic hidden entirely (the web build
  passes no control). `app/src/lib/dictation/use-dictation.ts` is the state
  machine hook wired into the composer.

## Model-download UX

First use probes `dictation_model_status`. Not ready → a consent dialog opens
showing the size (`DictationModelSetup` / `use-dictation-model-setup.ts`),
progress streams via a Tauri event (`dictation-model-progress`), and the model
state stays outside the capture/transcribe phase machine —
`DictationControl.state` stays `"idle"` while the dialog is open, since
nothing is being captured yet. A "model-not-ready" failure from a downstream
`transcribe_audio` call re-probes and reopens the dialog.

## Platform constraints

macOS needs `com.apple.security.device.audio-input`
(`app/src-tauri/entitlements.plist`) plus `NSMicrophoneUsageDescription` (new
`app/src-tauri/Info.plist`, merged in by the Tauri bundler). No mic access
without both.

## Release gates

`.github/workflows/release.yml` builds `whisper-cli` per target and asserts
the binary is executable before continuing (same fail-closed pattern as the
host sidecar and frpc — never ship the loud-fail placeholder `build.rs` stages
when the binary is absent): macOS builds aarch64 + x86_64 separately and
`lipo`s them into one universal `whisper-cli-universal-apple-darwin`; Windows
and Linux build per matrix target with a `test -x` gate.
