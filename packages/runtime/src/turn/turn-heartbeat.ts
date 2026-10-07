import { startClaimHeartbeat } from "./claim-heartbeat";
import type { TurnServerDeps } from "./server-types";
import type { TurnRequest } from "./types";

/**
 * A claimed turn's heartbeat, or null for an unclaimed one: a fenced claim
 * (released or adopted) aborts the turn, and a mode the claim reports
 * reaches the turn's live mode.
 */
export function startTurnHeartbeat(
  deps: Pick<TurnServerDeps, "fetchImpl" | "heartbeatIntervalMs">,
  turn: TurnRequest,
  abort: AbortController,
): ReturnType<typeof startClaimHeartbeat> | null {
  if (!turn.claim || !turn.hostToken) return null;
  return startClaimHeartbeat({
    claim: turn.claim,
    hostToken: turn.hostToken,
    onFenced: () => abort.abort(),
    onMode: (mode) => {
      if (turn.liveMode) turn.liveMode.current = mode;
    },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.heartbeatIntervalMs
      ? { intervalMs: deps.heartbeatIntervalMs }
      : {}),
  });
}
