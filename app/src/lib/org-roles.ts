import type { Agent, Capabilities, OrgRole } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free role logic for the multiplayer org surface. Mirrors the C3
 * role matrix (`convergence/contracts/C3-org-role-model.md`); the GATEWAY is
 * the real enforcer (these gates only hide affordances, never grant power).
 * Extracted so the who-can-see-what rules are unit-tested in isolation.
 */

/** True when the deployment runs in multiplayer mode (paid org). */
export function isMultiplayer(caps: Capabilities | null | undefined): boolean {
  return caps?.multiplayer === true;
}

/**
 * The caller's org role, or null in single-player mode. A multiplayer host
 * always advertises a role; treat a missing one as the least-privileged `user`
 * so a stale/absent field never widens power.
 */
export function orgRole(caps: Capabilities | null | undefined): OrgRole | null {
  if (!isMultiplayer(caps)) return null;
  return caps?.role ?? "user";
}

/**
 * Can this caller create agents? Owner/admin yes, plain `user` no. In
 * single-player mode (no org) creation is always allowed — the sole user owns
 * everything.
 */
export function canCreateAgents(
  caps: Capabilities | null | undefined,
): boolean {
  const role = orgRole(caps);
  if (role === null) return true;
  return role === "owner" || role === "admin";
}

/** Can this caller open the org Members management surface at all? */
export function canSeeMembers(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

/**
 * Can this caller MUTATE members (add / remove / change role)? Owner only per
 * C3 — admins see the roster read-only.
 */
export function canManageMembers(
  caps: Capabilities | null | undefined,
): boolean {
  return orgRole(caps) === "owner";
}

/**
 * Can this caller manage assignments for a specific agent (the "Who can use
 * this agent" block)? Owner for any org agent; admin only for agents they're
 * themselves assigned to; plain `user` never.
 */
export function canManageAssignments(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "assigned">,
): boolean {
  const role = orgRole(caps);
  if (role === "owner") return true;
  if (role === "admin") return agent.assigned === true;
  return false;
}

/** Can this caller read/edit their own per-agent integration grants? */
export function canManageAgentGrants(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "assigned">,
): boolean {
  if (orgRole(caps) === null) return false;
  return agent.assigned === true;
}

/**
 * The roles an owner may GRANT when adding or re-roling a member. Owner is the
 * single billing seat and is never handed out from the UI (ownership transfer
 * is out of scope for v1).
 */
export const GRANTABLE_ROLES: readonly OrgRole[] = ["admin", "user"] as const;

/** Whether a role can be picked in the add-member / change-role selects. */
export function isGrantableRole(role: OrgRole): boolean {
  return GRANTABLE_ROLES.includes(role);
}
