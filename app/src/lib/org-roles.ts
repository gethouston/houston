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
 * Should the global AI Models hub be visible to this caller? In a Teams
 * workspace the hub is owner/admin territory: AI provider connections are
 * org-level (one credential per org — whoever connects, every member's agents
 * work; C6), so a plain member has no account to connect there. Members pick
 * their own model per agent in the composer instead. Everyone else —
 * single-player and non-Teams multiplayer — keeps the hub unchanged. A
 * cosmetic gate: the gateway is the real enforcer (a member's provider-connect
 * POST already 403s); this only hides an affordance that would be dead for a
 * plain member.
 */
export function canSeeAiModelsPage(
  caps: Capabilities | null | undefined,
): boolean {
  if (isMultiplayer(caps) && caps?.teams === true) return canSeeMembers(caps);
  return true;
}

/**
 * Can this caller EDIT the org-wide policy ceilings (the app-allowlist ceiling
 * AND the AI-model ceiling)? Owner only per C7 — admins see the policy surfaces
 * read-only. A cosmetic gate: the gateway 403s a non-owner write, so this only
 * avoids offering a control that would fail.
 */
export function canEditOrgSettings(
  caps: Capabilities | null | undefined,
): boolean {
  return orgRole(caps) === "owner";
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
 * Can this caller SEE the team's billing detail (C8 §Billing wire surface)?
 * Owner/admin only — the gateway 403s a plain member's `GET /v1/org/billing`.
 * Members NEVER see billing data; they render the `OrgSummary.degraded` banner
 * and "ask your owner" copy instead. The admin/owner asymmetry lives elsewhere:
 * an admin sees the summary (this gate) but cannot checkout (owner-only write) —
 * the client shows admins the same "ask the owner to upgrade" copy, just better
 * informed. Single-player has no billing, so `null` role is denied here (unlike
 * `canCreateAgents`, which grants the sole user everything). A cosmetic gate:
 * the gateway is the sole enforcer.
 */
export function canSeeBilling(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

/**
 * Whether the C8 Billing surface (the org dashboard tab AND the `useBilling`
 * query) belongs at all: only on a Spaces-capable host (`caps.spaces`), only
 * when the ACTIVE space is a team (personal spaces are free forever and never
 * bill), and only for owner/admin (`canSeeBilling`; members never see billing
 * data — C8 §Client UX). One source of truth for both the tab-visibility gate
 * and the query-fire gate so they can never drift. The gateway is the sole
 * enforcer; this only hides an unusable affordance.
 */
export function canSeeBillingTab(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  return hasSpaces(caps) && activeSpaceIsTeam && canSeeBilling(caps);
}

/**
 * The roles an owner may GRANT when adding or re-roling a member. Owner is the
 * single billing seat and is never handed out from the UI (ownership transfer
 * is out of scope for v1).
 */
export const GRANTABLE_ROLES: readonly OrgRole[] = ["admin", "user"] as const;
