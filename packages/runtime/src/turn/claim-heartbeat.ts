import { TurnErrorCode, type TurnMode } from "@houston/protocol";
import type { TurnRequest } from "./types";

const REQUEST_TIMEOUT_MS = 5_000;

/** Per-claim heartbeat state owned by one admitted turn. */
export interface ClaimHeartbeat {
  readonly fenced: boolean;
  readonly stopReason?: TurnErrorCode;
  readonly stopReceivedAt?: number;
  /** Completion of the eager first heartbeat. */
  readonly ready: Promise<void>;
  /** Send and await a fresh heartbeat at a durability boundary. */
  checkpoint(): Promise<void>;
  /** Stop scheduling heartbeats and await the bounded in-flight request. */
  stop(): Promise<void>;
}

/** Start the eager, 15-second claim heartbeat loop for one turn. */
export function startClaimHeartbeat(opts: {
  claim: NonNullable<TurnRequest["claim"]>;
  hostToken: string;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  /** Fired once, the moment a heartbeat learns the claim was adopted. */
  onFenced?: () => void;
  onMode?: (mode: TurnMode) => void;
  onStop?: (reason: TurnErrorCode) => void;
}): ClaimHeartbeat {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const intervalMs = opts.intervalMs ?? 15_000;
  let fenced = false;
  let stopReason: TurnErrorCode | undefined;
  let stopReceivedAt: number | undefined;
  let stopped = false;
  let pending = Promise.resolve();

  const beat = async () => {
    if (stopped || fenced) return;
    try {
      const response = await fetchImpl(opts.claim.heartbeatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.hostToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: opts.claim.id,
          token: opts.claim.token,
          bootId: opts.claim.bootId,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 409) {
        fenced = true;
        clearInterval(timer);
        opts.onFenced?.();
      } else if (response.ok && response.status !== 204) {
        const body: unknown = await response.json();
        if (!body || typeof body !== "object") return;
        if (
          "mode" in body &&
          (body.mode === "execute" ||
            body.mode === "plan" ||
            body.mode === "auto")
        )
          opts.onMode?.(body.mode);
        if (
          "stop" in body &&
          body.stop === TurnErrorCode.TimeLimit &&
          !stopReason
        ) {
          stopReason = body.stop;
          stopReceivedAt = performance.now();
          opts.onStop?.(stopReason);
        }
      } else if (!response.ok) {
        console.warn(
          `[turn] claim heartbeat failed (${response.status}): ${(
            await response.text()
          ).slice(0, 300)}`,
        );
      }
    } catch (error) {
      console.warn(
        "[turn] claim heartbeat failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
  const runBeat = () => {
    pending = pending.then(beat);
    return pending;
  };
  const timer = setInterval(runBeat, intervalMs);
  timer.unref?.();
  runBeat();
  const ready = pending;

  return {
    get fenced() {
      return fenced;
    },
    get stopReason() {
      return stopReason;
    },
    get stopReceivedAt() {
      return stopReceivedAt;
    },
    ready,
    checkpoint: runBeat,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
    },
  };
}

/**
 * A claimed turn's heartbeat, or null for an unclaimed one: a fenced claim
 * aborts the turn, and a mode the gateway reports becomes the turn's live mode.
 */
export function startTurnClaimHeartbeat(
  turn: TurnRequest,
  abort: AbortController,
  opts: { fetchImpl?: typeof fetch; heartbeatIntervalMs?: number },
): ClaimHeartbeat | null {
  if (!turn.claim || !turn.hostToken) return null;
  return startClaimHeartbeat({
    claim: turn.claim,
    hostToken: turn.hostToken,
    onFenced: () => abort.abort(),
    onStop: (reason) => abort.abort(new DOMException(reason, "AbortError")),
    onMode: (mode) => {
      if (turn.liveMode) turn.liveMode.current = mode;
    },
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.heartbeatIntervalMs
      ? { intervalMs: opts.heartbeatIntervalMs }
      : {}),
  });
}
