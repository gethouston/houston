import type {
  Agent,
  AgentAssignment,
  OrgMember,
  OrgRole,
} from "@houston-ai/engine-client";
import {
  applyShareAction,
  buildSharePeople,
  needsSelfLockoutConfirm,
  type ShareAction,
  type SharePerson,
} from "../tabs/agent-access-model.ts";

/**
 * Pure, DOM-free logic behind the Permissions agent People tab: ONE agent, every
 * org member, and the None / Can use / Manager control for each. This is the
 * roster face of the Share dialog (which only lists people WITH access plus an
 * add-picker), so it reuses the dialog's own `agent-access-model` primitives
 * verbatim — the two surfaces never derive access or write rosters differently.
 * The GATEWAY is the sole enforcer; these helpers only shape the affordances.
 */

/**
 * One member's level on this agent. `none` = not on the roster; `user`/`manager`
 * = their assignment level. An org owner is always `manager`. The People tab is
 * reached only by a caller who manages the agent (page-level gate), so the
 * roster is always readable here — no `unknown` state exists.
 */
export type AgentPersonLevel = "none" | "user" | "manager";

/** One member row: the member, their level, and the flags the control reads. */
export interface AgentPersonRow {
  member: OrgMember;
  level: AgentPersonLevel;
  /** This is the signed-in viewer (guarded against self-lockout). */
  isSelf: boolean;
  /** Org owner: always has access, row is non-editable. */
  isOwner: boolean;
  /** May hold a Manager seat (org owner/admin only). */
  canBeManager: boolean;
}

/** May this person hold a Manager seat on an agent? Only org owner/admin can. */
export function canPersonBeManager(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * What the People tab renders, given the resolved rows and whether the viewer may
 * edit. Kept pure so the (small) degradation rule is unit-tested in isolation:
 *
 * - `roster` — one or more rows to show (the whole team, or the read-only lens).
 * - `viewerOnly` — a read-only viewer whose roster came back EMPTY. The gateway
 *   only serves the member list to owner/admin, so a plain member (org role
 *   `user`) sees no roster; rather than a misleading "no people" empty state we
 *   show an honest line: they can use the agent, and a manager controls access.
 * - `empty` — an editable context (a manager) with genuinely no members yet.
 */
export type AgentPeopleView = "roster" | "viewerOnly" | "empty";

export function agentPeopleView(
  rowCount: number,
  readOnly: boolean,
): AgentPeopleView {
  if (rowCount > 0) return "roster";
  return readOnly ? "viewerOnly" : "empty";
}

function rankOf(row: AgentPersonRow): number {
  if (row.isOwner) return 0;
  if (row.level === "manager") return 1;
  if (row.level === "user") return 2;
  return 3;
}

/**
 * A row for EVERY org member, level resolved against the agent's roster via the
 * Share dialog's {@link buildSharePeople} (which expands the everyone sentinel to
 * the whole team and always includes the owner as manager). Members absent from
 * that set have no access (`none`), so the owner can GRANT from here, not only
 * revoke. Sorted owner, then managers, then can-use, then no-access, by email.
 */
export function buildAgentPeople(opts: {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}): AgentPersonRow[] {
  const levelById = new Map(
    buildSharePeople(opts).map((p) => [p.userId, p.access]),
  );
  const rows = opts.members.map<AgentPersonRow>((member) => ({
    member,
    level:
      member.role === "owner"
        ? "manager"
        : (levelById.get(member.userId) ?? "none"),
    isSelf: member.userId === opts.selfId,
    isOwner: member.role === "owner",
    canBeManager: canPersonBeManager(member.role),
  }));
  return rows.sort((a, b) => {
    const r = rankOf(a) - rankOf(b);
    if (r !== 0) return r;
    const an = a.member.email ?? a.member.userId;
    const bn = b.member.email ?? b.member.userId;
    return an.localeCompare(bn);
  });
}

/**
 * The next assignee set to WRITE after changing one member's access (set-replace,
 * PUT `/agents/:slug/assignments`). Reuses the Share dialog's `buildSharePeople`
 * + `applyShareAction` so an everyone-agent materializes into an explicit roster
 * on first edit exactly as the dialog does. A member not yet on the roster is
 * appended at the chosen level; removing an absent member is a no-op. The org
 * owner is never stripped (guarded inside `applyShareAction`).
 */
export function writeAgentPerson(opts: {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
  userId: string;
  action: ShareAction;
}): AgentAssignment[] {
  const people = buildSharePeople(opts);
  if (people.some((p) => p.userId === opts.userId)) {
    return applyShareAction(people, opts.userId, opts.action);
  }
  const current = people.map((p) => ({ userId: p.userId, access: p.access }));
  if (opts.action === "remove") return current;
  return [...current, { userId: opts.userId, access: opts.action }];
}

/**
 * Would this action lock the signed-in VIEWER out of managing the agent (editing
 * their OWN row down/off)? Delegates to the Share dialog's
 * {@link needsSelfLockoutConfirm} so the confirm gate is identical across both
 * surfaces; builds the minimal `SharePerson` it reads.
 */
export function agentPersonNeedsConfirm(
  row: AgentPersonRow,
  action: ShareAction,
): boolean {
  const person: SharePerson = {
    userId: row.member.userId,
    orgRole: row.member.role,
    access: "manager",
    isSelf: row.isSelf,
    isOwner: row.isOwner,
    canBeManager: row.canBeManager,
  };
  return needsSelfLockoutConfirm(person, action);
}
