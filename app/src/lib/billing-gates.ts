/**
 * The Billing gates: who may SEE what an org costs.
 *
 * Split out of `org-roles.ts` (which stayed the caller's ROLE logic) because
 * billing asks a second question beyond the role: whether the ACTIVE org
 * bills at all. Same contract as its siblings: cosmetic gates only, the
 * gateway is the sole enforcer, and these merely hide affordances the caller
 * could not act on. Unit-tested in `app/tests/org-roles.test.ts`.
 */

import type { Capabilities, OrgBilling } from "@houston/engine-adapter";
import { hasSpaces, orgRole } from "./org-roles.ts";

/**
 * Is the caller an owner or admin of the active team? Single-player has no
 * billing, so a `null` role is denied here (unlike `canCreateAgents`, which
 * grants the sole user everything).
 */
export function canSeeBilling(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

/**
 * Whether the org's Billing tab belongs at all: a Spaces host, an active org
 * that carries org billing (a legacy org and every deployment without org
 * billing send none, so the billing state itself is the switch), and a caller
 * who pays for it or administers it. That covers every cloud org, the
 * Personal row included, whose sole owner is its billing owner. Plain members
 * never see the tab: their way to more usage is asking the owner.
 */
export function canSeeBillingTab(
  caps: Capabilities | null | undefined,
  billing: OrgBilling | null | undefined,
): boolean {
  if (!hasSpaces(caps) || !billing) return false;
  return billing.isBillingOwner || canSeeBilling(caps);
}

/**
 * Whether the team's C8 billing summary (`GET /v1/org/billing`) may be read:
 * a Spaces host whose deployment bills teams (`caps.teamBilling`; without it
 * every billing read answers 503 `not_configured`), a team space, and an
 * owner or admin (the gateway 403s a plain member). The team-status strip and
 * the team delete read it; the Billing tab reads the org's billing instead.
 */
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
