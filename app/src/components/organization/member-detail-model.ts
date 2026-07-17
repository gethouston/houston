import type {
  Agent,
  AgentAssignment,
  Capabilities,
  OrgMember,
  OrgRole,
} from "@houston-ai/engine-client";
import { isAgentManager } from "../../lib/agent-access.ts";
import {
  currentAssignments,
  isSharedWithEveryone,
  needsSelfLockoutConfirm,
  type ShareAction,
  type SharePerson,
} from "../tabs/agent-access-model.ts";

/**
 * Pure, DOM-free logic behind Admin > People's per-member access lens (the
 * inverse of the Share dialog: one PERSON, every agent, instead of one agent,
 * every person). Kept out of the `.tsx` so the "which agents can this person
 * reach / at what level / which can the viewer change" rules unit-test under
 * bare Node. The GATEWAY is the sole enforcer — these helpers only shape the
 * affordances and reuse the Share dialog's roster math (`agent-access-model`) so
 * the two lenses never derive access differently.
 */

/**
 * One person's access to one agent. `none` = not on the roster; `user`/`manager`
 * = their assignment level; `unknown` = the viewer can't read this agent's
 * roster (a non-owner admin over an agent they don't manage), so the level is
 * withheld rather than guessed. An org owner is `manager` on every agent.
 */
export type MemberAccessLevel = "none" | "user" | "manager" | "unknown";

/** One agent row in the member lens: the agent, the member's level, and whether
 *  the VIEWER may change it (their per-agent manager authority). */
export interface MemberAgentRow {
  agent: Agent;
  access: MemberAccessLevel;
  canEdit: boolean;
}

/**
 * The member's fleet split three ways (contract §1):
 * - `everyone` — agents shared org-wide (empty assignee set): always read-only,
 *   since converting an everyone-agent to an explicit roster from this view is
 *   too destructive a side effect for one toggle.
 * - `explicit` — agents with an explicit roster, each with the member's current
 *   level and a per-row editability flag (the viewer edits only agents they
 *   manage; the rest render read-only).
 */
export interface MemberAgentAccess {
  everyone: MemberAgentRow[];
  explicit: MemberAgentRow[];
}

/** May this person hold a Manager seat on an agent? Only org owner/admin can
 *  (`manager_requires_admin` on the wire for a plain member). */
export function canMemberBeManager(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/** The member's effective level on one agent, owner-first (see {@link MemberAccessLevel}). */
function resolveAccess(
  member: Pick<OrgMember, "userId" | "role">,
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): MemberAccessLevel {
  if (member.role === "owner") return "manager";
  if (isSharedWithEveryone(agent)) return "user";
  const hasRoster =
    agent.assignments !== undefined || agent.assignedUserIds !== undefined;
  if (!hasRoster) return "unknown";
  const found = currentAssignments(agent).find(
    (a) => a.userId === member.userId,
  );
  return found ? found.access : "none";
}

/**
 * Invert an agent fleet into one member's access lens (contract §2). Everyone-
 * agents are read-only; explicit agents carry the member's level plus whether
 * the viewer may edit them (`isAgentManager` — owner true everywhere, else the
 * viewer's effective `access === "manager"`). Every visible agent appears, even
 * those the member cannot reach (`access: "none"`), so the owner can GRANT from
 * here, not only revoke.
 */
export function memberAgentAccess(
  member: Pick<OrgMember, "userId" | "role">,
  agents: readonly Agent[],
  caps: Capabilities | null | undefined,
): MemberAgentAccess {
  const everyone: MemberAgentRow[] = [];
  const explicit: MemberAgentRow[] = [];
  for (const agent of agents) {
    const row: MemberAgentRow = {
      agent,
      access: resolveAccess(member, agent),
      canEdit: isAgentManager(caps, agent),
    };
    if (isSharedWithEveryone(agent)) everyone.push(row);
    else explicit.push(row);
  }
  return { everyone, explicit };
}

/**
 * The next assignee set to WRITE after changing one member's access on an agent
 * (set-replace, PUT `/agents/:slug/assignments`). Reuses the Share dialog's
 * `currentAssignments` so the roster read matches. The org owner is never
 * stripped (their access is implicit and always kept by the gateway).
 */
export function writeMemberAssignment(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
  member: Pick<OrgMember, "userId" | "role">,
  action: ShareAction,
): AgentAssignment[] {
  const current = currentAssignments(agent);
  const others = current.filter((a) => a.userId !== member.userId);
  if (action === "remove") {
    return member.role === "owner" ? current : others;
  }
  return [...others, { userId: member.userId, access: action }];
}

/**
 * Would this action lock the signed-in VIEWER out of managing the agent — i.e.
 * are they editing their OWN member row down/off? Delegates to the Share
 * dialog's {@link needsSelfLockoutConfirm} so the confirm gate is identical
 * across both lenses; builds the minimal `SharePerson` it reads.
 */
export function memberActionNeedsConfirm(opts: {
  member: Pick<OrgMember, "userId" | "role">;
  selfId: string | null;
  action: ShareAction;
}): boolean {
  const person: SharePerson = {
    userId: opts.member.userId,
    orgRole: opts.member.role,
    access: "manager",
    isSelf: opts.member.userId === opts.selfId,
    isOwner: opts.member.role === "owner",
    canBeManager: canMemberBeManager(opts.member.role),
  };
  return needsSelfLockoutConfirm(person, opts.action);
}
