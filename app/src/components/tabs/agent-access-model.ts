import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { canManageAssignments, isMultiplayer } from "../../lib/org-roles.ts";

/**
 * Pure toggle logic for the "Who can use this agent" block. The host convention
 * makes an EMPTY `assignedUserIds` mean "everyone in the org", so toggling off
 * the last assigned member must not PUT `[]` silently — that would widen access
 * to the whole org from a click that looks like it narrows it. That case is
 * returned as `confirmOpenToAll` for the UI to confirm-gate. Pure so it's
 * unit-testable.
 */

/**
 * Should the "Who can use this agent" share block render at all? Two conditions,
 * both required:
 *
 * 1. The deployment is multiplayer — single-player / self-host has no org to
 *    share within, so the block is meaningless and must degrade to nothing
 *    (like the grants surface does). `canManageAssignments` alone is NOT enough:
 *    under matrix v2 it short-circuits to `true` in single-player, so gating on
 *    it only would resurrect an empty, non-functional org-share block on every
 *    self-host agent.
 * 2. The caller can manage this agent's assignments (agent-manager authority).
 *
 * Pure so the visibility gate is unit-tested in isolation.
 */
export function canShowAgentShareBlock(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isMultiplayer(caps) && canManageAssignments(caps, agent);
}

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
