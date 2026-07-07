/**
 * Desktop dictation audio capture.
 *
 * WKWebView's `MediaRecorder` only emits AAC (no PCM/Opus container we could
 * feed whisper), so capture instead goes: `getUserMedia` -> an `AudioContext`
 * pinned to 16 kHz -> an `AudioWorklet` that posts raw Float32 frames back to
 * the main thread -> accumulate -> on stop, resample (if the platform ignored
 * the requested rate) -> encode as WAV (`wav.ts`).
 *
 * Auto-stops at 120s via `onAutoStop`; the caller (the dictation state
 * machine in `use-dictation.ts`) treats that identically to a user-initiated
 * stop — it still has to call `.stop()` to get the encoded bytes.
 */

import { DICTATION_WORKLET_SOURCE } from "./recorder-worklet";
import {
  DICTATION_SAMPLE_RATE,
  encodeWav,
  mergeFloat32,
  resampleLinear,
} from "./wav";

const MAX_RECORDING_MS = 120_000;
const WORKLET_NAME = "dictation-capture";

export interface DictationRecording {
  /** Stop capture, tear down all audio resources, and return the encoded WAV. */
  stop(): Promise<Uint8Array>;
  /** Discard capture and tear down all audio resources. */
  cancel(): void;
}

/** True when this webview can capture microphone audio at all. Mirrors the
 *  feature-detect `captureScreenshot` does in ui/chat/prompt-input.tsx. */
export function isDictationCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  );
}

function createWorkletModuleUrl(): string {
  const blob = new Blob([DICTATION_WORKLET_SOURCE], {
    type: "application/javascript",
  });
  return URL.createObjectURL(blob);
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Start capturing microphone audio. Rejects with the raw `getUserMedia`
 * error (`NotAllowedError` / `NotFoundError` / ...) so the caller can map it
 * to specific copy.
 */
export async function startDictationRecording(
  onAutoStop: () => void,
): Promise<DictationRecording> {
  if (!isDictationCaptureSupported()) {
    throw new DOMException(
      "No microphone input is available.",
      "NotFoundError",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const audioContext = new AudioContext({ sampleRate: DICTATION_SAMPLE_RATE });
  let node: AudioWorkletNode;
  try {
    const moduleUrl = createWorkletModuleUrl();
    try {
      await audioContext.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    node = new AudioWorkletNode(audioContext, WORKLET_NAME);
  } catch (err) {
    stopTracks(stream);
    await audioContext.close();
    throw err;
  }

  const frames: Float32Array[] = [];
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    frames.push(event.data);
  };
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(node);
  // Deliberately no `.connect(audioContext.destination)` — the user must
  // never hear their own mic looped back through the app.

  let tornDown = false;
  function teardown(): void {
    if (tornDown) return;
    tornDown = true;
    clearTimeout(autoStopTimer);
    node.port.onmessage = null;
    node.disconnect();
    source.disconnect();
    stopTracks(stream);
    void audioContext.close();
  }

  const autoStopTimer = setTimeout(() => {
    if (!tornDown) onAutoStop();
  }, MAX_RECORDING_MS);

  return {
    async stop() {
      const actualRate = audioContext.sampleRate;
      const merged = mergeFloat32(frames);
      teardown();
      const resampled = resampleLinear(
        merged,
        actualRate,
        DICTATION_SAMPLE_RATE,
      );
      return encodeWav(resampled, DICTATION_SAMPLE_RATE);
    },
    cancel() {
      teardown();
    },
  };
}
