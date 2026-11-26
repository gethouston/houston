/**
 * The cloud gateway's "nothing ran, send the same request again" refusals on
 * an agent's routes, for an org whose turns run on shared compute. Both are
 * `503` with the waking `error` string, so a client that predates the codes
 * retries them as it retries a pod wake; the `code` says which:
 *
 *  - `compute_busy`: the shared compute could not start this request now (no
 *    room, or a sandbox that failed before running it). Nothing ran.
 *  - `pod_wake_refused`: only the agent's standing pod could answer this
 *    request, and the gateway wakes it only as a last resort. Nothing ran.
 *
 * `retryAfterMs` mirrors the `Retry-After` header for clients that cannot read
 * it (a cross-origin browser without the header exposed).
 */
export type ComputeRefusalCode = "compute_busy" | "pod_wake_refused";

export interface ComputeRefusal {
  code: ComputeRefusalCode;
  error: string;
  detail?: string;
  retryAfterMs?: number;
}

const CODES: ReadonlySet<string> = new Set([
  "compute_busy",
  "pod_wake_refused",
]);

/** Parse only a typed compute refusal body; anything else is null. */
export function parseComputeRefusal(body: unknown): ComputeRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.has(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: ComputeRefusal = {
    code: value.code as ComputeRefusalCode,
    error: value.error,
  };
  if (typeof value.detail === "string") refusal.detail = value.detail;
  if (
    typeof value.retryAfterMs === "number" &&
    Number.isFinite(value.retryAfterMs) &&
    value.retryAfterMs >= 0
  )
    refusal.retryAfterMs = value.retryAfterMs;
  return refusal;
}

/** {@link parseComputeRefusal} over a raw response text. */
export function parseComputeRefusalText(text: string): ComputeRefusal | null {
  try {
    return parseComputeRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}
