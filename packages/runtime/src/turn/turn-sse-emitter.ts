import type { WireFrame } from "@houston/runtime-client";
import type { createTurnLog } from "./turn-log";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import type { createTurnTranscript } from "./turn-transcript";

export function createTurnEmitter(
  send: (frame: WireFrame) => void,
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null,
  log: ReturnType<typeof createTurnLog>,
  transcript: ReturnType<typeof createTurnTranscript>,
): (frame: WireFrame) => void {
  return (raw) => {
    const frame = sandbox ? sandbox.present(raw) : raw;
    send(log ? log.record(frame) : frame);
    // The runtime persists the user message before this frame. Publish it now
    // so a gateway restart can reconstruct the turn from its transcript.
    if (frame.type === "user") void transcript?.publishUser();
  };
}
