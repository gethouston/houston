import type { OrgSummary, OrgsList } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { freeOrgBilling } from "./org-billing-fixtures";
import { plusCheckoutOrgSlug, plusOfferApplies } from "./plus-org";

const PERSONAL = "00000000000000aa";
const TEAM = "00000000000000bb";
const org = (
  slug: string,
  kind: OrgSummary["kind"],
  isBillingOwner = true,
): OrgSummary => ({
  id: `o-${slug}`,
  slug,
  name: slug,
  kind,
  role: "owner",
  memberCount: 1,
  degraded: false,
  billing: freeOrgBilling({ isBillingOwner }),
});
const list = (...orgs: OrgSummary[]): OrgsList => ({
  orgs,
  invites: [],
  freeOrg: null,
});

describe("the org a Plus subscription pays for", () => {
  it("is the personal org, and nothing without one", () => {
    expect(
      plusCheckoutOrgSlug(list(org(TEAM, "team"), org(PERSONAL, "personal"))),
    ).toBe(PERSONAL);
    expect(plusCheckoutOrgSlug(list(org(TEAM, "team")))).toBeNull();
    expect(plusCheckoutOrgSlug(undefined)).toBeNull();
  });

  it("is offered only in that org, to the person who pays for it", () => {
    const both = list(org(PERSONAL, "personal"), org(TEAM, "team"));
    expect(plusOfferApplies(null, both)).toBe(true);
    expect(plusOfferApplies(TEAM, both)).toBe(false);
    expect(plusOfferApplies(null, list(org(PERSONAL, "personal", false)))).toBe(
      false,
    );
    expect(plusOfferApplies(null, undefined)).toBe(false);
  });
});
