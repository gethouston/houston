import type { OrgBilling, OrgSummary, OrgsList } from "./types";

export function activeSpaceOrgSlug(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): string | null {
  if (pinnedTeamSlug) return pinnedTeamSlug;
  return orgs?.orgs.find((o) => o.kind === "personal")?.slug ?? null;
}

export function activeOrg(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): OrgSummary | null | undefined {
  if (!orgs) return undefined;
  const slug = activeSpaceOrgSlug(pinnedTeamSlug, orgs);
  return orgs.orgs.find((o) => o.slug === slug) ?? null;
}

export function activeOrgBilling(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): OrgBilling | null | undefined {
  const org = activeOrg(pinnedTeamSlug, orgs);
  return org === undefined ? undefined : (org?.billing ?? null);
}
