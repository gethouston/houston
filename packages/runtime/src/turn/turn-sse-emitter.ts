import type { WireFrame } from "@houston/runtime-client";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnLog } from "./turn-log";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import { createTurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

export function prepareTurnStreams(
  deps: TurnServerDeps,
  turn: TurnRequest,
  turnId: string,
  filesystem: TurnFilesystem,
) {
  return {
    turnLog: createTurnLog(deps, turn),
    transcript: createTurnTranscript(deps, { ...turn, turnId }, filesystem),
  };
}

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
