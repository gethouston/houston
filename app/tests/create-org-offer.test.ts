import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgBilling, OrgSummary, OrgsList } from "@houston/engine-adapter";
import { paidOrgOffer } from "../src/components/shell/create-org-offer.ts";

const billing = (seatPriceCents: number): OrgBilling => ({
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner: true,
  seats: 1,
  seatPriceCents,
  seatGraceEndsAt: null,
  usage: null,
  routines: null,
});

const org = (patch: Partial<OrgSummary>): OrgSummary => ({
  id: "o",
  slug: "acme",
  name: "Acme",
  kind: "team",
  role: "owner",
  memberCount: 1,
  degraded: false,
  billing: billing(1500),
  ...patch,
});

const list = (...orgs: OrgSummary[]): OrgsList => ({
  orgs,
  invites: [],
  freeOrg: { available: false, orgSlug: orgs[0]?.slug ?? null },
});

describe("paidOrgOffer", () => {
  it("names the team that holds the free slot and its seat price", () => {
    deepStrictEqual(paidOrgOffer("Labs", "acme", list(org({}))), {
      name: "Labs",
      freeOrg: { kind: "named", name: "Acme" },
      seatPriceCents: 1500,
    });
  });

  it("lets the app name the Personal row itself", () => {
    const personal = org({ slug: "me", name: "daniel", kind: "personal" });
    deepStrictEqual(paidOrgOffer("Labs", "me", list(personal)).freeOrg, {
      kind: "personal",
    });
  });

  it("reads the price off another org when the free one has no billing", () => {
    const offer = paidOrgOffer(
      "Labs",
      "acme",
      list(org({ billing: null }), org({ slug: "b", billing: billing(1800) })),
    );
    deepStrictEqual(offer.seatPriceCents, 1800);
  });

  it("offers without a name or a price when the list is unread", () => {
    deepStrictEqual(paidOrgOffer("Labs", "acme", undefined), {
      name: "Labs",
      freeOrg: null,
      seatPriceCents: null,
    });
  });
});
