# app/src/lib/dictation: design decisions

Covers `app/src/lib/dictation/`: audio capture, metering and the local transcription model. File paths in this record are relative to `app/src/`.

## Capture through an AudioWorklet, not MediaRecorder

WKWebView's `MediaRecorder` only emits AAC, which whisper cannot read, so capture runs `getUserMedia` into an AudioWorklet that collects PCM. The worklet source is an inline string because the repo has no public-asset convention for worklets. The graph is never connected to the destination, so the user never hears their own microphone.

Lives in `lib/dictation/recorder.ts`, `lib/dictation/recorder-worklet.ts`.

## Level metering

Raw speech RMS is small, so a mild gain and a square-root curve map it to a visible level; one level per 100 ms is kept.

Lives in `lib/dictation/levels.ts`.

## State machine mirrors the UI package

The reducer mirrors `DictationState` from `@houston-ai/chat` exactly; events that do not apply return the same reference.

Lives in `lib/dictation/dictation-reducer.ts`.

## Sidecar failure shapes

`transcribe_audio` rejects with a raw string sentinel, a `DictationError` object mirroring the Rust type, or a whisper-cli failure carrying a stderr tail, which goes to Sentry extras.

Lives in `lib/dictation/sidecar-failure.ts`, `lib/dictation/types.ts`.

## Model download is verified

The pinned model is downloaded and sha256 verified with streamed progress.

Lives in `lib/dictation/model-download.ts`.

## Pre-AVX2 CPUs cannot run the sidecar

The bundled whisper-cli needs AVX2 on x86-64 Windows and Linux. That is an expected machine limit, explained before offering the model download and matched by an exact reject string.

Lives in `lib/dictation/types.ts`, `lib/dictation/use-dictation-model-setup.ts`, `lib/dictation/use-dictation.ts`.

## Model size hint mirrors the shell

The size fallback matches `MODEL_SIZE_BYTES` in `app/src-tauri/src/dictation/model.rs`.

Lives in `lib/dictation/use-dictation-model-setup.ts`.

## 16 kHz PCM

Whisper expects 16 kHz; some webviews ignore the requested `AudioContext` rate, so audio is resampled linearly, which is enough for speech.

Lives in `lib/dictation/wav.ts`.

## A failed transcription is reported and told

The user spoke and pressed stop, so a silent drop reads as broken; it is reported, then authored copy is shown.

Lives in `lib/dictation/use-dictation.ts`.
