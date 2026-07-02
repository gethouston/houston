/**
 * Pure toggle logic for the "Who can use this agent" block. The host convention
 * makes an EMPTY `assignedUserIds` mean "everyone in the org", so toggling off
 * the last assigned member must not PUT `[]` silently — that would widen access
 * to the whole org from a click that looks like it narrows it. That case is
 * returned as `confirmOpenToAll` for the UI to confirm-gate. Pure so it's
 * unit-testable.
 */
export type AssignmentToggleResult =
  | { kind: "set"; userIds: string[] }
  | { kind: "confirmOpenToAll" };

export function assignmentToggle(opts: {
  /** Every org member's user id (the expansion of "everyone"). */
  memberIds: readonly string[];
  /** The current explicit assignment set (empty = everyone). */
  assigned: ReadonlySet<string>;
  userId: string;
  on: boolean;
}): AssignmentToggleResult {
  const everyone = opts.assigned.size === 0;
  const next = new Set(everyone ? opts.memberIds : opts.assigned);
  if (opts.on) next.add(opts.userId);
  else next.delete(opts.userId);
  if (!opts.on && next.size === 0) return { kind: "confirmOpenToAll" };
  return { kind: "set", userIds: [...next] };
}
