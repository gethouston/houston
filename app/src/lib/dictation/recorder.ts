import { LevelAccumulator } from "./levels";
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
  stop(): Promise<Uint8Array>;
  cancel(): void;
  getLevels(): readonly number[];
}

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
  const levels = new LevelAccumulator(audioContext.sampleRate);
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    frames.push(event.data);
    levels.push(event.data);
  };
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(node);

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
    getLevels() {
      return levels.getLevels();
    },
  };
}
