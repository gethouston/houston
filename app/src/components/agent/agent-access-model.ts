import type {
  Agent,
  AgentAssignment,
  Capabilities,
  OrgMember,
  OrgRole,
} from "@houston-ai/engine-client";
import { canManageAssignments } from "../../lib/agent-access.ts";
import { hasSpaces, isMultiplayer } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free logic behind the Drive-style Share dialog for an agent. Kept
 * out of the `.tsx` so the "who may change whom / which option is offered /
 * self-lockout" rules unit-test under bare Node. The GATEWAY is the real
 * enforcer (contract §1/§5) — these helpers only shape the affordances.
 */

/**
 * Should the "Share" affordance render at all? Requires BOTH multiplayer (single
 * player / self-host has no org, so it must degrade to nothing) AND agent-manager
 * authority. `canManageAssignments` alone is not enough: under matrix v2 it
 * short-circuits to `true` in single-player, resurrecting an empty share surface
 * on every self-host agent. Pure so the gate is unit-tested in isolation.
 */
export function canShowAgentShareBlock(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isMultiplayer(caps) && canManageAssignments(caps, agent);
}

/**
 * How an agent's Share affordance should render, per C8 Spaces
 * (`cloud/docs/contracts/C8-spaces-billing.md` §Share-triggers-team). Powers
 * both the prominent header Share button and the buried Agent-settings block, so
 * the two entry points never drift on which surface a context opens:
 *
 * - `"manage"` — the Drive-style {@link canShowAgentShareBlock} block + share
 *   dialog: a multiplayer TEAM space where the caller manages this agent.
 * - `"inviteTeam"` — a PERSONAL space on a spaces-capable host: personal spaces
 *   are non-invitable (sharing always goes through a team), so instead of
 *   hiding, the Share affordance offers to move the agent into a team. Opens
 *   the ShareViaTeamFlow.
 * - `"view"` — a multiplayer caller who can SEE the agent but can't manage it (a
 *   plain member / an admin who only uses it). Google-Docs parity: they still
 *   open a read-only people list rather than a dead button. The gateway withholds
 *   the full assignee roster from non-managers, so the list shows the truthful
 *   subset it can resolve (always at least the viewer) — never a management UI.
 * - `"none"` — desktop / self-host (no multiplayer): render nothing.
 *
 * Personal-space precedence is deliberate: a personal space must NEVER show the
 * team share dialog (its `addOrgMember` 403s `personal_space`), so `inviteTeam`
 * wins over `manage` whenever the caller is in a personal space on a spaces host.
 */
export type AgentShareSurface = "manage" | "inviteTeam" | "view" | "none";

export function agentShareSurface(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  inPersonalSpace: boolean,
): AgentShareSurface {
  if (inPersonalSpace && hasSpaces(caps)) return "inviteTeam";
  if (canShowAgentShareBlock(caps, agent)) return "manage";
  if (isMultiplayer(caps)) return "view";
  return "none";
}

/** A per-agent access level. `manager` may reconfigure; `user` may only use. */
export type AccessLevel = "manager" | "user";

/** The per-person menu choices in the share dialog. */
export type ShareAction = "manager" | "user" | "remove";

/**
 * One person shown in the share dialog's people list — a member who currently
 * has access to the agent, resolved against the org roster for their name/email
 * and org role.
 */
export interface SharePerson {
  userId: string;
  email?: string;
  /** The person's ORG role (owner/admin/user), for eligibility + owner display. */
  orgRole: OrgRole;
  /** Their current per-agent access level. */
  access: AccessLevel;
  /** True when this is the signed-in viewer (guarded against self-lockout). */
  isSelf: boolean;
  /** Org owner: always has access, row is non-editable. */
  isOwner: boolean;
  /**
   * May this person be made an agent Manager? Only teammates holding a Manager
   * seat (org role owner/admin) can (`manager_requires_admin` on the wire).
   */
  canBeManager: boolean;
}

/**
 * The agent's current assignee list. Prefers the rich v2 `assignments`; falls
 * back to `assignedUserIds` (mapped to `user`) when only that is populated.
 * An EMPTY result is ambiguous (single-player vs. org-wide); to tell them apart
 * use {@link isSharedWithEveryone} rather than reading "empty" as "owner only".
 */
export function currentAssignments(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): AgentAssignment[] {
  if (agent.assignments && agent.assignments.length > 0) {
    return agent.assignments;
  }
  return (agent.assignedUserIds ?? []).map((userId) => ({
    userId,
    access: "user" as const,
  }));
}

/**
 * Is this agent shared org-wide? A present-but-empty assignee set is the
 * "everyone in the org" sentinel (`Agent.assignedUserIds`), honored by the
 * sibling org-agents-model. Single-player agents (no assignee fields) are NOT
 * org-wide. Ignoring this sentinel makes an org-wide agent read as owner-only
 * and silently narrows the team's access on the first edit.
 */
export function isSharedWithEveryone(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): boolean {
  const populated =
    agent.assignments !== undefined || agent.assignedUserIds !== undefined;
  return populated && currentAssignments(agent).length === 0;
}

function canBeManagerRole(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * The people who currently have access, as dialog rows. The org owner is always
 * included (they can use every org agent and can never be removed). An org-wide
 * agent ("everyone" sentinel) expands to every current member so the count is
 * truthful and editing operates on the real roster instead of silently dropping
 * the team. Sorted owner, then managers, then members, then by email/id.
 */
export function buildSharePeople(opts: {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}): SharePerson[] {
  const memberById = new Map(opts.members.map((m) => [m.userId, m]));
  const assigned = new Map(
    currentAssignments(opts.agent).map((a) => [a.userId, a.access]),
  );
  const ids = new Set<string>(assigned.keys());
  if (isSharedWithEveryone(opts.agent)) {
    for (const m of opts.members) ids.add(m.userId);
  }
  const owner = opts.members.find((m) => m.role === "owner");
  if (owner) ids.add(owner.userId);

  const people: SharePerson[] = [];
  for (const userId of ids) {
    const member = memberById.get(userId);
    const orgRole: OrgRole = member?.role ?? "user";
    const isOwner = orgRole === "owner";
    people.push({
      userId,
      email: member?.email,
      orgRole,
      access: isOwner ? "manager" : (assigned.get(userId) ?? "user"),
      isSelf: userId === opts.selfId,
      isOwner,
      canBeManager: canBeManagerRole(orgRole),
    });
  }
  return sortSharePeople(people);
}

function rankOf(p: SharePerson): number {
  if (p.isOwner) return 0;
  return p.access === "manager" ? 1 : 2;
}

function sortSharePeople(people: SharePerson[]): SharePerson[] {
  return [...people].sort((a, b) => {
    const r = rankOf(a) - rankOf(b);
    if (r !== 0) return r;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });
}

/**
 * Ensure the signed-in viewer appears in a people list, for the read-only
 * `"view"` surface a plain member sees. The gateway withholds the full assignee
 * roster from non-managers, so {@link buildSharePeople} may resolve only the org
 * owner (or nobody) for a member — yet a member is looking at an agent that was
 * shared TO them, so they always have access. Append a self row when absent so
 * the list is never empty and never omits the one person it can state for
 * certain. A no-op once the viewer already resolved (manager/owner callers), or
 * when there is no signed-in user id.
 */
export function withViewer(
  people: readonly SharePerson[],
  viewer: { userId: string | null; email?: string },
): SharePerson[] {
  if (!viewer.userId) return [...people];
  if (people.some((p) => p.isSelf || p.userId === viewer.userId)) {
    return [...people];
  }
  return [
    ...people,
    {
      userId: viewer.userId,
      email: viewer.email,
      orgRole: "user",
      access: "user",
      isSelf: true,
      isOwner: false,
      canBeManager: false,
    },
  ];
}

/** Org members who do NOT yet have access — the add-people picker universe. */
export function addableMembers(
  members: readonly OrgMember[],
  people: readonly SharePerson[],
): OrgMember[] {
  const has = new Set(people.map((p) => p.userId));
  return members
    .filter((m) => !has.has(m.userId))
    .sort((a, b) => (a.email ?? a.userId).localeCompare(b.email ?? b.userId));
}

/**
 * The next assignment set to WRITE after a per-person action. The org owner is
 * never removed. Returns the `{userId, access}[]` the dialog PUTs.
 */
export function applyShareAction(
  people: readonly SharePerson[],
  userId: string,
  action: ShareAction,
): AgentAssignment[] {
  const target = people.find((p) => p.userId === userId);
  // Defensive: never strip the owner's implicit access.
  if (action === "remove" && target?.isOwner) {
    return people.map((p) => ({ userId: p.userId, access: p.access }));
  }
  return people
    .filter((p) => !(p.userId === userId && action === "remove"))
    .map((p) => ({
      userId: p.userId,
      access: p.userId === userId && action !== "remove" ? action : p.access,
    }));
}

/** Assignment set after adding a member (defaults to `user`). No-op if present. */
export function addPerson(
  people: readonly SharePerson[],
  member: OrgMember,
): AgentAssignment[] {
  const base = people.map((p) => ({ userId: p.userId, access: p.access }));
  if (base.some((a) => a.userId === member.userId)) return base;
  return [...base, { userId: member.userId, access: "user" }];
}

/**
 * Would this action lock the signed-in viewer out of managing the agent? Only
 * for their OWN row, and not the org owner (who always keeps authority):
 * removing themselves loses access; demoting to `user` loses manage ability.
 * Both must be confirm-gated so one click never silently strips own authority.
 */
export function needsSelfLockoutConfirm(
  person: SharePerson,
  action: ShareAction,
): boolean {
  if (!person.isSelf || person.isOwner) return false;
  return action === "remove" || action === "user";
}

/**
 * Is the agent shared with more than one person? Drives the chat "Shared agent"
 * note (contract §6), whose target audience is the replying teammate.
 *
 * A plain member (`access === "user"`) is exactly that audience, yet the gateway
 * withholds `assignments`/`assignedUserIds` from non-managers (contract §5), so
 * the assignee count would read 0 and the note would never reach them. But an
 * agent a member can see at all was shared TO them — at minimum the owner also
 * has access — so it is inherently a shared agent: return true. For a
 * manager/owner caller (`access` absent or `"manager"`) the real assignee list
 * is present, so fall back to the count (their own unshared agent stays quiet).
 */
export function isSharedWithOthers(
  agent: Pick<Agent, "assignments" | "assignedUserIds" | "access">,
): boolean {
  if (agent.access === "user") return true;
  if (isSharedWithEveryone(agent)) return true;
  return currentAssignments(agent).length > 1;
}
