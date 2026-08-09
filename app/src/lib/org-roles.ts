import type { Capabilities, OrgRole } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free caps-only role logic for the multiplayer org surface. Mirrors
 * the Teams role matrix v2 (contract §1 — supersedes the old C3 matrix; note the
 * admin "see all agents" rule is GONE, and per-agent authority is now the agent
 * `access` level rather than mere assignment). These gates read only from
 * `Capabilities`; the PER-AGENT authority gates that take an `agent` argument
 * live in `./agent-access`. The GATEWAY is the real enforcer (these gates only
 * hide affordances, never grant power). Extracted so the who-can-see-what rules
 * are unit-tested in isolation.
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
 * Is the ACTIVE space a PERSONAL one — a space holding exactly one human?
 *
 * The question only exists on a C8 Spaces host: there the switcher offers a
 * personal space beside the team spaces, and the gateway gives the personal one
 * single-player semantics (non-invitable, no roster to manage). On a non-spaces
 * host there is no personal/team split at all, so the answer is always false and
 * every people surface behaves exactly as it did before Spaces shipped.
 *
 * Every surface that asks the question LIVE reads it here, through
 * `usePersonalSpace`, and several do: the org dashboard and Permissions drop
 * out entirely (`canSeeOrganization`), and the C13 people affordances — a
 * team's Members card, the rail's "Join a team" and its "Leave team" — hide,
 * because a space with one human has nobody to add, remove, promote or leave a
 * team to, and the gateway answers those routes `403 personal_space`. The pure
 * models downstream (`agent-access-model.ts`,
 * `mission-person-filter-model.ts`) take the ANSWER as a boolean rather than
 * calling this, which is what keeps them testable without capabilities.
 *
 * What a personal space DOES keep is teams themselves: a solo user groups their
 * own agents with them exactly like anyone else.
 */
export function isPersonalSpace(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  return hasSpaces(caps) && !activeSpaceIsTeam;
}

/**
 * Does this deployment serve C13 agent teams? A FEATURE-DETECT — the gateway
 * describing whether IT owns the teams and their rosters (`GET /v1/org/teams`),
 * not a feature flag we may flip. Absent/false on desktop, self-host and every
 * gateway that predates C13, where a team is the local backend's named sidebar
 * group plus the virtual default team; the off-capability path stays
 * byte-identical. The gateway is the sole enforcer — this only picks which
 * backend resolves the rail (`lib/teams-backend.ts`).
 */
export function hasAgentTeams(caps: Capabilities | null | undefined): boolean {
  return caps?.agentTeams === true;
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
 * Should the global AI Models hub be visible to this caller? ALWAYS — for
 * everyone, in every deployment (HOU-976).
 *
 * It used to be owner/admin territory in a Teams workspace, on the premise that
 * AI provider connections were org-level and a plain member therefore had no
 * account to connect. That premise is gone: a team space has NO shared AI
 * account — every turn runs on the AI account of the member who sent it — so the
 * hub is where each of them connects their own. Hiding it left the only surface
 * that can manage a personal account unreachable by the person who owns it, with
 * no admin able to connect one on their behalf.
 *
 * Opening the hub does NOT widen anything else: the TEAM's own consumption is
 * not on it. Per-account usage on a hub card is the caller's own account
 * (HOU-789), while the space-wide roll-up lives in Admin > Usage behind
 * {@link canSeeOrganization} (HOU-788), which is untouched.
 *
 * Kept as a function (rather than deleted at every call site) because it names
 * WHY the surface is visible, and because the gateway remains the real enforcer
 * of every write behind it.
 */
export function canSeeAiModelsPage(
  _caps: Capabilities | null | undefined,
): boolean {
  return true;
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
 * Can this caller DELETE the active workspace? Owner only (PRODUCT-1247) — an
 * admin ("Manager" in the Teams UI) may run the space day-to-day but must not
 * be able to destroy it, and a plain member never could. Single-player (null
 * role) is always allowed: the sole user owns every local workspace, mirroring
 * `canCreateAgents`. A cosmetic gate: the gateway is the real enforcer.
 */
export function canDeleteWorkspace(
  caps: Capabilities | null | undefined,
): boolean {
  const role = orgRole(caps);
  return role === null || role === "owner";
}

/**
 * Does this caller OWN the space they are looking at, as opposed to merely
 * running it? The same owner/admin line {@link canDeleteWorkspace} draws, asked
 * of the ACTIVE space rather than of the workspace record: an admin ("Manager"
 * in the Teams UI) keeps the space working day to day, but the things that
 * define what the space IS are the owner's.
 *
 * Only the last of the three answers is about roles at all. Not multiplayer
 * (desktop, self-host, single player) is true: one human, everything here is
 * theirs, and a role gate with no second person to gate against would only
 * hide the user's own product from them. A C8 personal space is true for the
 * same reason one layer up — the gateway gives it single-player semantics
 * (non-invitable, no roster), so its one human owns it however the org role
 * happens to read. Everything else is `owner` only.
 *
 * Cosmetic: the gateway is the real enforcer, and this only decides whether an
 * affordance is worth offering.
 */
export function isSpaceOwner(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  if (!isMultiplayer(caps)) return true;
  if (isPersonalSpace(caps, activeSpaceIsTeam)) return true;
  return orgRole(caps) === "owner";
}

/**
 * The roles an owner may GRANT when adding or re-roling a member. Owner is the
 * single billing seat and is never handed out from the UI (ownership transfer
 * is out of scope for v1).
 */
export const GRANTABLE_ROLES: readonly OrgRole[] = ["admin", "user"] as const;
