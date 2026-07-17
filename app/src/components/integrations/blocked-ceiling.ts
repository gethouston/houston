/**
 * Role-aware signposting for a policy-BLOCKED app: which ceiling forbids it, and
 * the deep-link that would fix it for a viewer who can act. One pure layer so no
 * surface re-derives the org-vs-agent attribution (the effective allowlist is
 * org ∩ agent, so a blocked slug is either outside the ORG ceiling or merely
 * outside the AGENT ceiling) and so the who-can-fix decision is unit-tested
 * without React. DOM-free + dependency-free.
 */

/** Which ceiling blocks an app: the org-wide one, or this agent's own. */
export type BlockingCeiling = "org" | "agent";

/**
 * Which ceiling forbids `slug`. The org ceiling wins: a slug outside the org
 * allowlist is org-blocked even if the agent ceiling would also drop it (the
 * owner must lift the org ceiling first). Otherwise it is the agent ceiling that
 * narrows it. A `null` ceiling means "unrestricted" (the whole catalog), so a
 * `null` org ceiling can never be the org block. Slug matching is exact (slugs
 * are normalized lowercase across this codebase).
 */
export function blockingCeiling(
  slug: string,
  ceilings: {
    orgAllowedToolkits: readonly string[] | null;
    agentAllowedToolkits: readonly string[] | null;
  },
): BlockingCeiling {
  const org = ceilings.orgAllowedToolkits;
  if (org !== null && !org.includes(slug)) return "org";
  return "agent";
}

/**
 * Resolve the "Enable it in Permissions" action for a blocked app, or
 * `undefined` when the viewer cannot fix that app's ceiling (the member view,
 * which keeps the ask-your-admin copy). The returned thunk performs the deep
 * link. Authority is per ceiling: the org ceiling is owner-editable
 * (`canEditOrg`), the agent ceiling is agent-manager-editable AND only reachable
 * by someone who can open the Admin dashboard (`canManageAgent` folds both), so
 * a plain member and a non-admin manager both fall through to `undefined`.
 */
export type PermissionsFix = (slug: string) => (() => void) | undefined;

export function resolvePermissionsFix(opts: {
  orgAllowedToolkits: readonly string[] | null;
  agentAllowedToolkits: readonly string[] | null;
  /** The viewer may edit the org-wide app ceiling (owner). */
  canEditOrg: boolean;
  /** The viewer manages this agent AND can open the Admin dashboard. */
  canManageAgent: boolean;
  /** Deep-link to the org Allowed apps section (org-ceiling fix). */
  openOrgApps: () => void;
  /** Deep-link to this agent's Admin drill-in (agent-ceiling fix). */
  openAgentDetail: () => void;
}): PermissionsFix {
  return (slug) => {
    if (blockingCeiling(slug, opts) === "org") {
      return opts.canEditOrg ? opts.openOrgApps : undefined;
    }
    return opts.canManageAgent ? opts.openAgentDetail : undefined;
  };
}
