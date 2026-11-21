import type { ServerResponse } from "node:http";
import { openSSE } from "../transport/sse";
import type { TurnServerDeps } from "./server-types";
import type { TurnSetupError } from "./turn-layout";
import { createTurnLog } from "./turn-log";
import { turnSetupErrorFrame } from "./turn-terminal";
import type { TurnRequest } from "./types";

export async function answerTurnSetupFailure(opts: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  error: TurnSetupError;
  res: ServerResponse;
}): Promise<() => void> {
  const sse = openSSE(opts.res);
  const frame = turnSetupErrorFrame(opts.error, opts.turnId);
  const turnLog = createTurnLog(opts.deps, opts.turn);
  sse.send(turnLog ? turnLog.record(frame) : frame);
  await turnLog?.flush();
  return sse.close;
}
