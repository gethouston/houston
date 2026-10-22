/**
 * Where one model round-trip stands. `requesting`: a request to `provider`'s
 * model, `promptTokens` long, is out (or goes out after `afterMs` of retry
 * backoff) and its response has not started. `responding`: the response is
 * streaming. `idle`: no request is out (a tool runs, a compaction
 * summarizes).
 */
export type ModelPhase =
  | {
      phase: "requesting";
      provider: string;
      afterMs?: number;
      promptTokens?: number;
    }
  | { phase: "responding" }
  | { phase: "idle" };
