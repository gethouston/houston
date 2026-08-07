import type {
  Agent,
  AgentAssignment,
  OrgMember,
} from "@houston-ai/engine-client";
import {
  buildSharePeople,
  isSharedWithEveryone,
  needsSelfLockoutConfirm,
} from "../tabs/agent-access-model.ts";
import type { AccessMode } from "../tabs/agent-admin/agent-admin-row-values.ts";

/**
 * Pure, DOM-free logic behind the top-level access choice above the People
 * roster: "Everyone on your team" vs "Only specific people".
 *
 * It writes the SAME wire shape the Share dialog and the People roster write
 * (`PUT /v1/agents/:slug/assignments`, set-replace), against the existing
 * everyone-agent sentinel: an EMPTY assignee set means org-wide access
 * ({@link isSharedWithEveryone}, `tauriAgents.setAssignments` "Empty =
 * everyone"), and any explicit set means exactly those people. There is no
 * third state on the wire, so the choice is a faithful two-way mapping:
 *
 * - "Everyone on your team" writes `[]`.
 * - "Only specific people" MATERIALIZES the roster the everyone sentinel
 *   currently expands to ({@link buildSharePeople} — every member, owner as
 *   manager), which is exactly what the first per-person edit does today. The
 *   write therefore changes nobody's effective access; it only makes the
 *   implicit roster explicit so people can then be removed one by one.
 *
 * The one thing the sentinel CANNOT carry is a per-person level: `[]` has no
 * room for a Manager grant, so switching to "Everyone" drops any manager other
 * than the org owner (whom {@link buildSharePeople} always re-adds). That is a
 * real change to materialized assignments, which is why
 * {@link everyoneChangesAssignments} exists: the UI confirm-gates the switch
 * whenever it would alter anyone's resolved access.
 *
 * The GATEWAY is the sole enforcer; these helpers only shape the affordance.
 */

/** The roster inputs every helper here reads, same shape the People tab builds. */
export interface AgentRosterInput {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}

/**
 * Which side of the choice the agent is currently on, in the vocabulary the
 * shared `AccessChoice` control speaks: `"any"` = everyone in the team (the
 * empty sentinel), `"picked"` = an explicit roster.
 */
export function agentAccessMode(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): AccessMode {
  return isSharedWithEveryone(agent) ? "any" : "picked";
}

/**
 * May the choice be offered at all? Only with a visible roster: materializing
 * "only specific people" expands the team into an explicit set, and with no
 * members to expand that write would be the EMPTY set, i.e. silently the
 * everyone sentinel again. Rather than a control whose click does the opposite
 * of its label, the People section hides it until the roster loads (the
 * gateway also withholds the roster from non-managers).
 */
export function canChooseAgentAccess(members: readonly OrgMember[]): boolean {
  return members.length > 0;
}

/**
 * How many people the agent's roster RESOLVES to today — the everyone sentinel
 * expanded to the whole team, an explicit set plus the always-present org
 * owner. This is the number the People section renders, so it is also the
 * number the rail badges; the raw `assignments` array badges neither.
 */
export function agentPeopleCount(input: AgentRosterInput): number {
  return buildSharePeople(input).length;
}

/** The assignee set that means "everyone on your team": the empty sentinel. */
export function everyoneAssignments(): AgentAssignment[] {
  return [];
}

/**
 * The assignee set to write when switching to "Only specific people": today's
 * effective roster, made explicit. Reuses {@link buildSharePeople} so the
 * expansion (everyone sentinel to the whole team, org owner always manager)
 * is identical to the one the roster below already renders.
 */
export function materializeRoster(input: AgentRosterInput): AgentAssignment[] {
  return buildSharePeople(input).map((person) => ({
    userId: person.userId,
    access: person.access,
  }));
}

function accessByUserId(input: AgentRosterInput): Map<string, string> {
  return new Map(buildSharePeople(input).map((p) => [p.userId, p.access]));
}

/**
 * Would switching to "Everyone on your team" change anybody's resolved access?
 * Compares the roster as it resolves today against the roster the empty
 * sentinel resolves to. False for an agent already shared with the whole team
 * at "Can use" (the switch is then a pure no-op); true whenever someone would
 * gain access or lose a Manager seat, which the UI confirm-gates.
 */
export function everyoneChangesAssignments(input: AgentRosterInput): boolean {
  const before = accessByUserId(input);
  const after = accessByUserId({
    ...input,
    agent: { assignments: [], assignedUserIds: [] },
  });
  if (before.size !== after.size) return true;
  for (const [userId, access] of before) {
    if (after.get(userId) !== access) return true;
  }
  return false;
}

/**
 * Which confirm the "Everyone on your team" switch must show before it writes.
 *
 * - `"selfLockout"` — the VIEWER holds a non-owner Manager grant today. The
 *   empty sentinel cannot carry it, so the switch demotes them to a plain user
 *   and takes this very page away. That is the same act the per-person control
 *   already gates ({@link needsSelfLockoutConfirm}), so it gets the same
 *   destructive `share.selfLockout` warning rather than a cheerful
 *   "give everyone access".
 * - `"changesAccess"` — somebody else's resolved access changes (teammates gain
 *   access, or another manager is demoted). Informational, not destructive.
 * - `"none"` — a pure no-op; write it straight through.
 */
export type EveryoneSwitchConfirm = "selfLockout" | "changesAccess" | "none";

export function everyoneSwitchConfirm(
  input: AgentRosterInput,
): EveryoneSwitchConfirm {
  const self = buildSharePeople(input).find((person) => person.isSelf);
  // The switch demotes every non-owner manager to `user`; it only locks the
  // VIEWER out if they hold that Manager grant right now.
  if (self?.access === "manager" && needsSelfLockoutConfirm(self, "user")) {
    return "selfLockout";
  }
  return everyoneChangesAssignments(input) ? "changesAccess" : "none";
}
