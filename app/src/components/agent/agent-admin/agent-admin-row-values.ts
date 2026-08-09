/**
 * A row's resting-state ceiling value, shared by the AI-model (`allowedModels`)
 * and allowed-integrations (`allowedToolkits`) rows since both have the same
 * shape. `undefined` settings (still loading / not a Teams host) → `null` (show
 * no value yet); a `null` ceiling → "all"; else the explicit count. Pure and
 * DOM/i18n-free so the sidebar nav rail's inline-state logic is unit-tested; the caller
 * maps the descriptor to the right i18n key (allModels/allApps, count plurals).
 */
export type CeilingValue =
  | { kind: "all" }
  | { kind: "count"; count: number }
  | null;

export function ceilingValue(
  allowed: string[] | null | undefined,
): CeilingValue {
  if (allowed === undefined) return null;
  return allowed === null
    ? { kind: "all" }
    : { kind: "count", count: allowed.length };
}

/**
 * The explicit two-option choice a ceiling maps to: `"any"` when `null` (every
 * model/app allowed), `"picked"` when an explicit set (including `[]`). Drives
 * the always-visible {@link AccessChoice} radio in the model + app editors so a
 * manager never has to reason about a verb flip. Pure so it unit-tests.
 */
export type AccessMode = "any" | "picked";

export function ceilingMode(allowed: string[] | null): AccessMode {
  return allowed === null ? "any" : "picked";
}
