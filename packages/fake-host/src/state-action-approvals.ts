/**
 * Per-agent integration action approvals — the in-memory store behind the
 * `/v1/agents/:id/action-approvals/grants` route (routes-action-approvals.ts).
 * Mirrors the real host's `LocalActionApprovals`/`ActionApprovalStore`: the
 * approval card's confirm ("Do it") GRANTS an action slug (any params), deduped
 * case-insensitively. The fake host runs no real turns and needs no TTL, so a
 * grant simply persists until reset.
 *
 * A missing agent key reads as the empty record; the seed carries none.
 */

import { state } from "./state-store";

/** The agent's record, materializing the empty one on first touch. */
function record(agentId: string): { grants: string[] } {
  let rec = state.actionApprovals.get(agentId);
  if (!rec) {
    rec = { grants: [] };
    state.actionApprovals.set(agentId, rec);
  }
  return rec;
}

/** The agent's granted action slugs (a fresh copy). */
export function grantedActions(agentId: string): string[] {
  return [...record(agentId).grants];
}

/** Grant an action (dedupe case-insensitively, keep the first casing) and return
 *  the resulting list. */
export function grant(agentId: string, action: string): string[] {
  const rec = record(agentId);
  const a = action.toLowerCase();
  if (!rec.grants.some((x) => x.toLowerCase() === a)) rec.grants.push(action);
  return [...rec.grants];
}

/** Is the action granted for this agent (case-insensitive)? */
export function isGranted(agentId: string, action: string): boolean {
  const a = action.toLowerCase();
  return record(agentId).grants.some((x) => x.toLowerCase() === a);
}

/** Test-observability snapshot: every agent's granted action slugs, flattened
 *  across agents. Lets an e2e confirm the confirm-card posted the step's action
 *  (the grants route is write-only by design — a client never reads grants back,
 *  so this `/__test__` window is the harness's read side). */
export function approvalsSnapshot(): { grants: string[] } {
  const grants: string[] = [];
  for (const rec of state.actionApprovals.values()) grants.push(...rec.grants);
  return { grants };
}
