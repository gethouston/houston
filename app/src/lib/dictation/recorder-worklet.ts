/**
 * Source for the `dictation-capture` AudioWorkletProcessor, as a plain
 * string. There's no other worklet/worker in this repo to follow a
 * `public/` asset convention from, so this loads via a Blob URL instead
 * (see `recorder.ts`) — no bundler wiring needed, works identically under
 * Vite dev and the packaged Tauri app.
 *
 * Posts each 128-frame render quantum's mono channel data back to the main
 * thread as a Float32Array (structured-clone copy, so the processor's
 * internal buffer can't be mutated out from under an in-flight postMessage).
 */
export const DICTATION_WORKLET_SOURCE = `
class DictationCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}
registerProcessor("dictation-capture", DictationCaptureProcessor);
`;
