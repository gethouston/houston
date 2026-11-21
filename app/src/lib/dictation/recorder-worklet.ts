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
