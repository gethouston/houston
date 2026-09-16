import type { IncomingMessage } from "node:http";
import type { LiveTurnPin } from "./live-turn";
import { MAX_JSON_BYTES, readBody } from "./read-body";

/**
 * The turn request's body, drained AT MOST ONCE and shared by every seam on the
 * way to the agent's engine (routes/agents-turn-seams.ts).
 *
 * The stream is exhausted after the first read, so a second seam that read the
 * request again would hand the engine an EMPTY body — and on a managed
 * coordinator pod (gateway-fronted, so every seam runs) that is the whole
 * message, its mode pin, its mentions and its approval receipts, dropped. One
 * memo is what makes the seams independent of each other's order.
 */
export interface TurnBody {
  /** The bytes, read from the request the first time any seam asks. */
  read(): Promise<Buffer>;
  /** Replace what the engine receives (the approval receipts rewrite it). */
  replace(body: Buffer): void;
  /** What was drained, or undefined when no seam needed the body at all. */
  peek(): Buffer | undefined;
}

export function turnBody(req: IncomingMessage): TurnBody {
  let buffer: Buffer | undefined;
  return {
    async read() {
      buffer ??= await readBody(req, MAX_JSON_BYTES);
      return buffer;
    },
    replace(body) {
      buffer = body;
    },
    peek() {
      return buffer;
    },
  };
}

/** The `mode` a turn body pins, when it carries one the host can read. */
export function turnModeOf(body: Buffer): unknown {
  try {
    return (JSON.parse(body.toString("utf8") || "{}") as { mode?: unknown })
      .mode;
  } catch {
    // An unparseable body pins nothing; the channel this request is headed for
    // answers the caller (see the mentions read in agents-turn-seams.ts, which
    // swallows for the same reason). "execute" is the safe reading: the plan
    // gate refuses work, and refusing on a body nobody could parse would be a
    // denial of service.
    return undefined;
  }
}

/**
 * The provider/model/effort a turn body pins (the composer forwards its
 * effective pair on every send; a programmatic fire carries the routine's).
 * Undefined when the body names no provider: a model without a provider is
 * not a pair the runtime could run, so nothing is recorded.
 */
export function turnPinOf(body: Buffer): LiveTurnPin | undefined {
  let parsed: { provider?: unknown; model?: unknown; effort?: unknown };
  try {
    parsed = JSON.parse(body.toString("utf8") || "{}") as typeof parsed;
  } catch {
    // Same reasoning as turnModeOf: the channel answers an unparseable body.
    return undefined;
  }
  if (typeof parsed.provider !== "string" || !parsed.provider) return undefined;
  return {
    provider: parsed.provider,
    ...(typeof parsed.model === "string" && parsed.model
      ? { model: parsed.model }
      : {}),
    ...(typeof parsed.effort === "string" && parsed.effort
      ? { effort: parsed.effort }
      : {}),
  };
}
