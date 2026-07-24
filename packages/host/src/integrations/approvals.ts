import { createHash } from "node:crypto";

/**
 * Pure helpers for the integration action-approval gate. `hashActionParams`
 * fingerprints an execute call so the app can dedupe approval STEPS by the exact
 * action+params on the turn holder (it rides the 409 payload as `paramsHash`);
 * `displayParams` renders the params into card-ready rows (plus the count of
 * rows dropped past the cap) for the approval prompt the runtime shows on the
 * interaction card.
 */

/** Recursively sort object keys so JSON.stringify is order-independent (arrays
 *  keep their order — position is semantic there). Primitives pass through. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * A deterministic fingerprint of `{action, params}` — canonical JSON with
 * recursively SORTED object keys, sha256, truncated to 16 hex chars. Stable
 * across key-order permutations (so re-serializing the same call re-hashes
 * identically) yet sensitive to any value drift. 16 chars (64 bits) is ample
 * for the per-agent approval-step space the app dedupes with it.
 */
export function hashActionParams(
  action: string,
  params: Record<string, unknown>,
): string {
  const canonical = JSON.stringify(sortKeysDeep({ action, params }));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

const MAX_VALUE_LEN = 80;
const MAX_ROWS = 8;

/** API plumbing the card never shows a non-technical user ("user_id: me" reads
 *  weird, even scary). Display-only: the params HASH covers every raw param, so
 *  hiding a row never weakens the drift gate — a changed user_id still re-asks. */
const INTERNAL_PARAM_KEYS = new Set([
  "user_id",
  "userid",
  "connected_account_id",
  "connectedaccountid",
  "account_id",
  "accountid",
  "entity_id",
  "entityid",
]);

const isInternalParamKey = (key: string) =>
  INTERNAL_PARAM_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase()) ||
  INTERNAL_PARAM_KEYS.has(key.toLowerCase());

/** "draft_id" -> "Draft id", "maxResults" -> "Max results": a human label from
 *  an API param key — plain words, sentence case, no underscores on the card. */
export function humanizeParamKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.length === 0
    ? key
    : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Card-ready display rows for the approval prompt, written for a NON-TECHNICAL
 * reader: internal plumbing keys (user_id and friends) are hidden, remaining
 * keys are humanized ("draft_id" -> "Draft id"), string values pass through,
 * everything else is JSON.stringify'd; each value is truncated to 80 chars with
 * a trailing ellipsis when cut; at most the first 8 surviving entries (original
 * key order) are shown so a large param bag never floods the card. `omitted`
 * counts only rows dropped past the CAP — hidden plumbing is not "omitted",
 * it's noise (the hash covers ALL raw params either way, so an invisible one
 * still gates the call).
 */
export function displayParams(params: Record<string, unknown>): {
  params: Record<string, string>;
  omitted: number;
} {
  const out: Record<string, string> = {};
  const keys = Object.keys(params).filter((k) => !isInternalParamKey(k));
  for (const key of keys.slice(0, MAX_ROWS)) {
    const raw = params[key];
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const value =
      text.length > MAX_VALUE_LEN ? `${text.slice(0, MAX_VALUE_LEN)}…` : text;
    out[humanizeParamKey(key)] = value;
  }
  return { params: out, omitted: Math.max(0, keys.length - MAX_ROWS) };
}
