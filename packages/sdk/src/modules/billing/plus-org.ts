import type { OrgsList } from "@houston/wire-types";
import { activeSpaceOrgSlug } from "../spaces/active-space";

/**
 * The org a Plus subscription pays for: the person's own (personal) org, the
 * one `POST /v1/me/plus/checkout` bills once plans move to orgs. `null` when
 * the list is unread or holds no personal org.
 */
export function plusCheckoutOrgSlug(orgs: OrgsList | undefined): string | null {
  return activeSpaceOrgSlug(null, orgs);
}

/**
 * Whether a Plus offer pays for the org in front of the person: the active org
 * is the one Plus bills and the person pays for it. In anyone else's org, or a
 * team org of their own, buying Plus would leave the org they are looking at
 * exactly as it is.
 */
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
