import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer, orgRole } from "./org-roles.ts";

/**
 * The per-agent authority gates of the Teams role matrix v2 (contract §1). These
 * take an `agent` argument because authority is decided PER AGENT: the org role
 * sets the ceiling, but the caller's effective `access` level on each agent picks
 * manager vs user. The caps-only org gates (create / see-members / billing / org
 * policy) stay in `./org-roles`. The GATEWAY is the real enforcer — these gates
 * only hide affordances, never grant power. Split out so the
 * who-can-do-what-to-which-agent rules are unit-tested in isolation.
 */

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
