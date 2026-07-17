/**
 * THE single answer to "can agent X use app Y right now, and if not why". One
 * pure classifier so no surface re-derives the rule from scratch: the
 * agent-integrations view model buckets every connection through this, and the
 * exported states name each reason a user might see.
 *
 * Usability is now purely connection ∩ effective allowlist — the per-agent
 * GRANTS layer is gone (permissions live in exactly one place, the Permissions
 * view). Precedence is deliberate (first match wins): an admin ceiling outranks
 * everything (a blocked app reads as "your admin turned this off", never "not
 * connected"), then a missing connection, then usable. Toolkit matching is exact
 * slug equality — slugs are already normalized lowercase across this codebase
 * (see `splitByGrant`), so no case-folding here. DOM-free + dependency-free so
 * it's trivially unit-testable.
 */

/** Why an agent can or cannot use an app, as a discriminated union. */
export type EffectiveAccess =
  | { state: "usable" }
  | { state: "notConnected" }
  | { state: "blockedByAdmin" };

/** The bare state tag, for callers that only need the classification. */
export type EffectiveAccessState = EffectiveAccess["state"];

export function effectiveAccess(input: {
  toolkit: string;
  /** Active-or-recovering connections of the acting user (any toolkit). */
  connections: readonly { toolkit: string }[];
  /** Effective allowlist (org ∩ agent); `null` = unrestricted. */
  allowlist: readonly string[] | null;
}): EffectiveAccess {
  const { toolkit, connections, allowlist } = input;
  if (allowlist !== null && !allowlist.includes(toolkit)) {
    return { state: "blockedByAdmin" };
  }
  if (!connections.some((c) => c.toolkit === toolkit)) {
    return { state: "notConnected" };
  }
  return { state: "usable" };
}
