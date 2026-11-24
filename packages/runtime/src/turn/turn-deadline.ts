import { BROWSER_HANDOFF_LIMIT_MS } from "@houston/wire-types";
import type { HandoffBudget } from "../session/tools/browser/tool";

export const TURN_TOKEN_TTL_MS = 30 * 60_000;

/**
 * Kept free at the end of a turn for what runs after the hand-off: the model
 * reading the page, and the final durability sync, which needs the token. A
 * sync past it fails, and the transcript and the saved sign-ins go with it.
 */
export const TURN_END_RESERVE_MS = 10 * 60_000;

/** Less than this is no time for a person to sign in to anything. */
export const MIN_HANDOFF_MS = 60_000;

const PREFIX = "turn-v1.";

/**
 * When the turn's host token expires, in epoch ms. Read WITHOUT verifying:
 * the worker cannot (the key is the gateway's) and need not (the token only
 * shortens its own wait). Wire form `turn-v1.<base64url(json)>.<sig>` with
 * `exp` (and, when the gateway stamps it, `iat`) in Unix seconds. Anything
 * else (a standing host token, a malformed one) falls back to `arrivedAt` +
 * the TTL. Both count from arrival, later than the dispatch the token's clock
 * started at, so they run a dispatch delay late; the end reserve is what
 * keeps that harmless.
 */
export function turnTokenExpiry(
  hostToken: string | undefined,
  arrivedAt: number,
): number {
  const fallback = arrivedAt + TURN_TOKEN_TTL_MS;
  const claims = readClaims(hostToken);
  if (!claims) return fallback;
  const exp = seconds(claims.exp);
  if (exp === undefined) return fallback;
  const iat = seconds(claims.iat);
  // With `iat` the token's lifetime is clock-free: counted from arrival it
  // never depends on this sandbox's clock agreeing with the gateway's (a
  // snapshot-restored sandbox can run behind OR ahead). The token was minted
  // at dispatch, before arrival, so this overstates the expiry by the
  // dispatch delay (seconds); TURN_END_RESERVE_MS absorbs it. Without `iat`,
  // `exp` is read on this clock.
  if (iat !== undefined && iat <= exp) return arrivedAt + (exp - iat) * 1000;
  return exp * 1000;
}

/** The token's claims object, or undefined for anything not a turn token. */
function readClaims(
  hostToken: string | undefined,
): Record<string, unknown> | undefined {
  if (!hostToken?.startsWith(PREFIX)) return undefined;
  const [payload, signature, extra] = hostToken.slice(PREFIX.length).split(".");
  if (!payload || !signature || extra !== undefined) return undefined;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    console.warn("[turn] host token claims are not JSON; using the TTL", error);
    return undefined;
  }
  return typeof claims === "object" && claims !== null && !Array.isArray(claims)
    ? (claims as Record<string, unknown>)
    : undefined;
}

/** A positive, finite Unix-seconds claim, else undefined. */
function seconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * A pooled turn's hand-off budget: the full limit, cut to end
 * {@link TURN_END_RESERVE_MS} before the host token does, and `null` (refuse
 * to hand over) once less than {@link MIN_HANDOFF_MS} would be left.
 */
export function turnHandoffBudget(
  expiresAt: number,
  now: () => number = Date.now,
  limitMs: number = BROWSER_HANDOFF_LIMIT_MS,
): HandoffBudget {
  return () => {
    const left = Math.min(limitMs, expiresAt - now() - TURN_END_RESERVE_MS);
    return left < MIN_HANDOFF_MS ? null : left;
  };
}
