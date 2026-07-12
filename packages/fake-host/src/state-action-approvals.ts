/**
 * Per-agent integration action approvals — the in-memory store behind the
 * `/v1/agents/:id/action-approvals[...]` routes (routes-action-approvals.ts).
 * Mirrors the real host's `LocalActionApprovals`/`ActionApprovalStore`:
 *   - `always`: action slugs the user chose "Always allow" for (any params),
 *     deduped case-insensitively (first casing kept);
 *   - `tickets`: one-shot "Allow once" grants, each a params-fingerprint hash,
 *     consumed on the matching execute. The fake host runs no real turns, so
 *     nothing consumes a ticket over HTTP — `consumeTicket` exists so a test
 *     can assert the consume-once semantic directly.
 *
 * A missing agent key reads as the empty record; the seed carries none.
 */

import { state } from "./state-store";

/** The agent's record, materializing the empty one on first touch. */
function record(agentId: string): { always: string[]; tickets: string[] } {
  let rec = state.actionApprovals.get(agentId);
  if (!rec) {
    rec = { always: [], tickets: [] };
    state.actionApprovals.set(agentId, rec);
  }
  return rec;
}

/** The agent's always-allow action slugs (a fresh copy). */
export function alwaysAllowed(agentId: string): string[] {
  return [...record(agentId).always];
}

/** Append an action to the always-allow list (dedupe case-insensitively, keep
 *  the first casing) and return the resulting list. */
export function allowAlways(agentId: string, action: string): string[] {
  const rec = record(agentId);
  const a = action.toLowerCase();
  if (!rec.always.some((x) => x.toLowerCase() === a)) rec.always.push(action);
  return [...rec.always];
}

/** Write a one-shot ticket for a params-fingerprint hash (replacing an existing
 *  same-hash ticket, so a re-approve stays single-use). */
export function addTicket(agentId: string, hash: string): void {
  const rec = record(agentId);
  rec.tickets = rec.tickets.filter((t) => t !== hash);
  rec.tickets.push(hash);
}

/** Consume a one-shot ticket: true iff one with that hash existed — it is then
 *  removed (single use). Missing → false. */
export function consumeTicket(agentId: string, hash: string): boolean {
  const rec = record(agentId);
  const i = rec.tickets.indexOf(hash);
  if (i === -1) return false;
  rec.tickets.splice(i, 1);
  return true;
}

/** Test-observability snapshot: every agent's always-slugs and pending "Allow
 *  once" ticket hashes, flattened across agents. The real `tickets` route is
 *  write-only by design (a granted ticket is a secret the client never reads
 *  back), so an e2e that must confirm "Allow once posted the step's hash" has no
 *  product route to assert against — this `/__test__` window is the harness
 *  equivalent of the in-process `consumeTicket` unit hook. */
export function approvalsSnapshot(): { always: string[]; tickets: string[] } {
  const always: string[] = [];
  const tickets: string[] = [];
  for (const rec of state.actionApprovals.values()) {
    always.push(...rec.always);
    tickets.push(...rec.tickets);
  }
  return { always, tickets };
}
