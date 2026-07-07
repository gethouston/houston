/**
 * Pure set arithmetic for per-agent integration grants. The grant unit is the
 * connected ACCOUNT (its connection id), not the toolkit — a user may connect
 * several accounts of one app and grant each independently. The host API is a
 * replace-set PUT, so every add/remove must be computed against the FRESHEST
 * known set at mutate time — never a set captured in a closure (a stale
 * snapshot silently wipes grants made in between, e.g. during the 5-minute
 * OAuth poll). `useAgentGrantMutation` feeds this the live query-cache value.
 * Pure so it's unit-testable.
 */
export interface GrantChange {
  connectionId: string;
  op: "add" | "remove";
}

/** Apply one grant change to a set, idempotently and without duplicates. */
export function applyGrantChange(
  current: readonly string[],
  change: GrantChange,
): string[] {
  if (change.op === "add") {
    return current.includes(change.connectionId)
      ? [...current]
      : [...current, change.connectionId];
  }
  return current.filter((g) => g !== change.connectionId);
}

/** Reverse one grant change (the optimistic-update rollback on error). */
export function reverseGrantChange(
  current: readonly string[],
  change: GrantChange,
): string[] {
  return applyGrantChange(current, {
    connectionId: change.connectionId,
    op: change.op === "add" ? "remove" : "add",
  });
}

/**
 * Null-aware apply: `null` means the host answered "grants unsupported" (404),
 * so there is no set to change and the value stays `null` (the mutation must
 * never fabricate a set on an unsupported host). Any real array is changed as
 * usual. Pure so the null guard is unit-testable.
 */
export function applyGrantChangeNullable(
  current: string[] | null,
  change: GrantChange,
): string[] | null {
  if (current === null) return null;
  return applyGrantChange(current, change);
}
