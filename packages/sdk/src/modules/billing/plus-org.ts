import type { OrgsList } from "@houston/wire-types";
import { activeSpaceOrgSlug } from "../spaces/active-space";

export function plusCheckoutOrgSlug(orgs: OrgsList | undefined): string | null {
  return activeSpaceOrgSlug(null, orgs);
}

export function plusOfferApplies(
  pinnedTeamSlug: string | null,
  orgs: OrgsList | undefined,
): boolean {
  const plusOrg = plusCheckoutOrgSlug(orgs);
  if (!plusOrg || activeSpaceOrgSlug(pinnedTeamSlug, orgs) !== plusOrg)
    return false;
  const org = orgs?.orgs.find((o) => o.slug === plusOrg);
  return org?.billing?.isBillingOwner === true;
}
