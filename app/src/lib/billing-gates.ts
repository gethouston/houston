import type { Capabilities, OrgBilling } from "@houston/engine-adapter";
import { hasSpaces, orgRole } from "./org-roles.ts";

export function canSeeBilling(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

export function canSeeBillingTab(
  caps: Capabilities | null | undefined,
  billing: OrgBilling | null | undefined,
): boolean {
  if (!hasSpaces(caps) || !billing) return false;
  return billing.isBillingOwner || canSeeBilling(caps);
}

export function canReadTeamBillingSummary(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  return (
    hasSpaces(caps) &&
    caps?.teamBilling === true &&
    activeSpaceIsTeam &&
    canSeeBilling(caps)
  );
}
