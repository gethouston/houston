import type { FirstDayRefusal, FirstDayRefusalCode } from "@houston/protocol";

/**
 * The 409 a refused first-day start answers with (`POST
 * /agents/:agentId/first-day`), from the host on desktop and self-host and
 * from the gateway's pool path in the cloud. The codes are the protocol's
 * `FirstDayRefusalCode`; `first_day_no_provider` alone may name the pinned
 * `provider` that is not connected.
 *
 * Erasable-syntax-only with a type-only import, so the app's node:test entry
 * points load it through the `@houston/wire-types/first-day-refusal` subpath.
 */
export type { FirstDayRefusal } from "@houston/protocol";

const CODES: readonly string[] = [
  "first_day_not_pending",
  "first_day_not_started",
  "first_day_no_provider",
  "first_day_provider_unavailable",
] satisfies readonly FirstDayRefusalCode[];

/** Parse only a typed first-day refusal body; anything else is null. */
export function parseFirstDayRefusal(body: unknown): FirstDayRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.includes(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: FirstDayRefusal = {
    code: value.code as FirstDayRefusalCode,
    error: value.error,
  };
  if (
    value.code === "first_day_no_provider" &&
    typeof value.provider === "string" &&
    value.provider
  )
    refusal.provider = value.provider;
  return refusal;
}

/** {@link parseFirstDayRefusal} over a raw response text. */
export function parseFirstDayRefusalText(text: string): FirstDayRefusal | null {
  try {
    return parseFirstDayRefusal(JSON.parse(text));
  } catch {
    // Not JSON: no typed refusal; the caller keeps the raw text.
    return null;
  }
}
