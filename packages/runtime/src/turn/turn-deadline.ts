import { BROWSER_HANDOFF_LIMIT_MS } from "@houston/wire-types";
import type { HandoffBudget } from "../session/tools/browser/tool";

export const TURN_TOKEN_TTL_MS = 30 * 60_000;

export const TURN_END_RESERVE_MS = 10 * 60_000;

export const MIN_HANDOFF_MS = 60_000;

const PREFIX = "turn-v1.";

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
  if (iat !== undefined && iat <= exp) return arrivedAt + (exp - iat) * 1000;
  return exp * 1000;
}

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

function seconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

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
