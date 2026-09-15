/**
 * `dictation` category: the bundled whisper.cpp sidecar. Transcription runs
 * entirely on the user's machine (like the local-model bridge), so this never
 * moves to the engine.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DictationModelProgress,
  DictationModelStatus,
} from "../dictation/types";
import { invokeNative } from "./invoke.ts";

/** Transcribe a recorded WAV clip. The raw bytes ride the IPC payload (same
 *  raw-payload pattern as `osSaveDownload`) so a multi-megabyte clip can't
 *  freeze the webview; the language hint rides the `x-dictation-lang` header.
 *  Rejects with the exact string "model-not-ready" when the model hasn't
 *  been downloaded (or is the wrong size on disk), or with a
 *  `DictationSidecarFailure` object (message "transcription-timeout" or
 *  "dictation: whisper exited with ...") carrying whisper's stderr tail. */
export function osTranscribeAudio(
  wav: Uint8Array,
  langHint: string,
): Promise<string> {
  return invokeNative<string>("transcribe_audio", wav, {
    headers: { "x-dictation-lang": langHint },
  });
}

/** Whether the pinned dictation model is on disk. */
export function osDictationModelStatus(): Promise<DictationModelStatus> {
  return invokeNative<DictationModelStatus>("dictation_model_status");
}

/** Download (and sha256-verify) the pinned dictation model. Idempotent —
 *  resolves immediately if already ready. Progress rides the
 *  `dictation-model-progress` event; subscribe via
 *  {@link onDictationModelProgress} before calling this. */
export function osDownloadDictationModel(): Promise<void> {
  return invokeNative<void>("download_dictation_model");
}

/** Subscribe to `dictation-model-progress` ticks emitted while
 *  {@link osDownloadDictationModel} runs. Mirrors how `local-bridge-status`
 *  is consumed (see `useLocalBridgeStatus`) — resolves with the unlisten fn. */
export function onDictationModelProgress(
  handler: (progress: DictationModelProgress) => void,
): Promise<UnlistenFn> {
  return listen<DictationModelProgress>("dictation-model-progress", (ev) =>
    handler(ev.payload),
  );
}
