import type { OrgBilling, OrgsList } from "./types";

/**
 * The org slug the hosted gateway resolves the active space to: the key its
 * per-org switches and org-scoped routes read (the pool serve list, the A2A
 * path). A team space pins its slug on `x-houston-org`, so that slug is the
 * answer. The personal space sends no header and the gateway resolves the
 * caller's personal membership, whose slug only the memberships list
 * (`listOrgs`) carries.
 *
 * `null` means no slug is known: the memberships are unread, or none of them
 * is personal. A caller on a deployment without spaces never asks.
 */
export function activeSpaceOrgSlug(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): string | null {
  if (pinnedTeamSlug) return pinnedTeamSlug;
  return orgs?.orgs.find((o) => o.kind === "personal")?.slug ?? null;
}

/**
 * The active org's billing, the one org-plan contract every surface reads
 * (usage, routine state, locks, whether the caller pays), from the
 * memberships list every member can read. `null` when the org is unknown or
 * still legacy; `undefined` while the list is unread.
 */
export function activeOrgBilling(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): OrgBilling | null | undefined {
  if (!orgs) return undefined;
  const slug = activeSpaceOrgSlug(pinnedTeamSlug, orgs);
  return orgs.orgs.find((o) => o.slug === slug)?.billing ?? null;
}
