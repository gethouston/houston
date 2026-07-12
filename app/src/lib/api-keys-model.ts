import type { ApiKey, Capabilities } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free logic behind the API-keys settings section (C9). Kept out of
 * the `.tsx` so the capability gate, the name validation, the `key_limit`
 * classifier, and the last-used state all unit-test under bare Node.
 */

/** Server-enforced bounds on a key name (C9: trimmed 1..100). */
export const MAX_KEY_NAME_LENGTH = 100;

/**
 * True when this deployment serves the C9 public API, so the API-keys section
 * should show. Absent/false on desktop, self-host, and gateways that predate the
 * public API, so the whole surface stays hidden there.
 */
export function apiKeysSupported(caps: Capabilities | null): boolean {
  return caps?.apiKeys === true;
}

/**
 * True when `name` is an acceptable key name: non-empty after trimming and at
 * most {@link MAX_KEY_NAME_LENGTH} characters. Drives the create button's enabled
 * state so an empty/too-long name never reaches the gateway.
 */
export function isValidKeyName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_KEY_NAME_LENGTH;
}

/**
 * True for the gateway's `400 {code:"key_limit"}` — the caller already holds the
 * maximum active keys (C9). An EXPECTED business state (revoke one to free a
 * slot), NOT a Houston bug, so the create flow silences it from the red
 * "report a bug" toast and renders it inline instead. Reads the raw top-level
 * `code` on the error body (the gateway's flat `{error, code}` shape), not the
 * nested `error.code` that the engine-client `.code` getter looks at.
 */
export function isKeyLimitError(err: unknown): boolean {
  const e = err as { status?: unknown; body?: unknown } | null | undefined;
  if (e?.status !== 400) return false;
  const code = (e.body as { code?: unknown } | null | undefined)?.code;
  return code === "key_limit";
}

/**
 * True for the gateway's `404 Not Found` on a revoke — the key is already gone.
 * The list is cached for 30s, and two revoke clicks can land in the same window,
 * so revoking a key the gateway no longer has is EXPECTED idempotency, NOT a
 * Houston bug. The revoke flow silences it from the red "report a bug" toast and
 * treats it as success (the row disappears once the list refreshes).
 */
export function isKeyGoneError(err: unknown): boolean {
  const e = err as { status?: unknown } | null | undefined;
  return e?.status === 404;
}

/**
 * How a key's "last used" should read: `never` until it first authenticates a
 * request, otherwise the instant it last did. An absent OR unparseable
 * `lastUsedAt` both collapse to `never` so the row never shows a misleading
 * date. The caller localizes the instant (relative time) and the "never" label.
 */
export type LastUsedState = { kind: "never" } | { kind: "at"; atMs: number };

export function lastUsedState(key: Pick<ApiKey, "lastUsedAt">): LastUsedState {
  if (!key.lastUsedAt) return { kind: "never" };
  const atMs = Date.parse(key.lastUsedAt);
  return Number.isNaN(atMs) ? { kind: "never" } : { kind: "at", atMs };
}
