import type { Agent, Capabilities, OrgRole } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free role logic for the multiplayer org surface. Mirrors the Teams
 * role matrix v2 (contract §1 — supersedes the old C3 matrix; note the admin
 * "see all agents" rule is GONE, and per-agent authority is now the agent
 * `access` level rather than mere assignment). The GATEWAY is the real enforcer
 * (these gates only hide affordances, never grant power). Extracted so the
 * who-can-see-what rules are unit-tested in isolation.
 */

/** True when the deployment runs in multiplayer mode (paid org). */
export function isMultiplayer(caps: Capabilities | null | undefined): boolean {
  return caps?.multiplayer === true;
}

/**
 * Does this deployment serve C8 Spaces (self-serve team creation, agent moves,
 * the multi-membership space switcher)? A cosmetic feature-detect — the gateway
 * is the sole enforcer. Absent/false on desktop/self-host, so the switcher's
 * create action stays "create a local workspace" there and becomes "create a
 * team" only on a hosted deployment that advertises the surface.
 */
export function hasSpaces(caps: Capabilities | null | undefined): boolean {
  return caps?.spaces === true;
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
 * Is this caller an "agent-manager" for a specific agent — the per-agent editor
 * role (Google Drive: managers are editors of the shared folder)? This is the
 * single per-agent authority gate behind renaming/deleting, sharing, and
 * configuring an agent (contract §1 matrix v2).
 *
 * - Single-player (no org): always true — the sole user owns everything.
 * - Multiplayer `owner`: always true (owner manages every org agent).
 * - Otherwise: the caller's effective `access` on this agent is `"manager"`.
 *
 * Purely trusts `agent.access`: the gateway already CLAMPS access to the org
 * role at read/enforcement time, so a role-`user` never carries an effective
 * `access="manager"` on the wire (a stale `manager` row is clamped away before
 * it reaches the client). The client therefore does not re-clamp by role —
 * `access` is already effective. Admins are NOT auto-managers of agents they
 * merely use; they must hold `access="manager"` (matrix v2 dropped the admin
 * "see/manage all" rule).
 */
export function isAgentManager(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  if (!isMultiplayer(caps)) return true;
  if (orgRole(caps) === "owner") return true;
  return agent.access === "manager";
}

/**
 * Semantic alias of {@link isAgentManager}: can this caller EDIT an agent's
 * configuration — instructions (CLAUDE.md), skills, the AI model, and agent
 * settings (allowed toolkits)? Same gate, named for the config-editing call
 * sites so their intent reads clearly (matrix v2: configure-scope is
 * agent-manager only; a plain member gets a read-only view and the gateway
 * 403s any write).
 */
export const canEditAgentConfig = isAgentManager;

/**
 * Can this caller manage assignments for a specific agent (the "Who can use
 * this agent" / share block)? Agent-manager semantics (contract §1): owner for
 * any org agent; otherwise only when the caller's effective `access` on the
 * agent is `"manager"`; plain members and admins-who-only-use never can. The
 * old "admin manages any agent they're assigned to" rule is gone in matrix v2.
 */
export function canManageAssignments(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isAgentManager(caps, agent);
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
 * Can this caller EDIT an agent's integration grants on a grants-serving host?
 * Single-player (no org roles) always can — the sole user owns everything, the
 * same short-circuit the global Integrations page uses; without it a self-host /
 * local sidecar that serves grants would render the agent tab fully read-only.
 * Multiplayer defers to the assignment rule (any assigned user gates their OWN
 * grants, independent of agent-manager authority). Whether the host serves grants
 * at all is a separate concern the caller gates on.
 */
export function canEditAgentGrants(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "assigned">,
): boolean {
  return !isMultiplayer(caps) || canManageAgentGrants(caps, agent);
}

/**
 * The roles an owner may GRANT when adding or re-roling a member. Owner is the
 * single billing seat and is never handed out from the UI (ownership transfer
 * is out of scope for v1).
 */
export const GRANTABLE_ROLES: readonly OrgRole[] = ["admin", "user"] as const;
