/**
 * Pure PCM/WAV helpers for on-device dictation. No DOM, no Tauri — the
 * recorder (`recorder.ts`) is the only caller, and this module exists
 * separately so the encode/resample math can run under the bare Node test
 * runner (`app/tests/dictation-wav.test.ts`).
 *
 * Output format is fixed: mono, 16-bit signed PCM, 16 kHz — exactly what the
 * bundled whisper-cli sidecar expects (`transcribe_audio` in
 * `app/src-tauri/src/dictation/whisper.rs`).
 */

/** The sample rate the whisper model expects. `AudioContext({ sampleRate })`
 *  is requested at this rate; some platforms silently ignore the request, so
 *  the recorder resamples to this rate on stop regardless. */
export const DICTATION_SAMPLE_RATE = 16000;

/** Concatenate the Float32 frames captured across the AudioWorklet's
 *  lifetime into one contiguous buffer. */
export function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Linear-interpolation resample from `fromRate` to `toRate`. Good enough for
 * speech-to-text (whisper itself tolerates far worse); a sinc/FFT resampler
 * would be overkill for a mono voice clip capped at 120s.
 */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(0, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  const lastIndex = input.length - 1;
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.min(Math.floor(srcPos), lastIndex);
    const idx1 = Math.min(idx0 + 1, lastIndex);
    const frac = srcPos - idx0;
    const a = input[idx0] ?? 0;
    const b = input[idx1] ?? 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Clamp to [-1, 1] and scale to a signed 16-bit sample, rounding half away
 *  from zero so the mapping is deterministic (and testable byte-exact). */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    out[i] = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
  }
  return out;
}

function writeAsciiString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

/** Encode mono 16-bit PCM samples as a standard 44-byte-header WAV file. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = DICTATION_SAMPLE_RATE,
): Uint8Array {
  const pcm = floatTo16BitPCM(samples);
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");

  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format: 1 = PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true); // block align (mono, 16-bit)
  view.setUint16(34, 16, true); // bits per sample

  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44, pcm.length).set(pcm);

  return new Uint8Array(buffer);
}
