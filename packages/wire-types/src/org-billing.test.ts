import { describe, expect, it } from "vitest";
import { parseOrgBilling, readCreatedOrg, readOrgsList } from "./org-billing";

const BILLING = {
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner: false,
  seats: 3,
  seatPriceCents: 1500,
  seatGraceEndsAt: null,
  usage: {
    scope: "org",
    used: 12,
    limit: 40,
    resetsAt: "2026-10-30T00:00:00Z",
  },
  routines: {
    paused: false,
    kept: null,
    needsChoice: false,
    limitedCount: 0,
    maxActive: 1,
    minIntervalMinutes: 15,
  },
};

describe("parseOrgBilling", () => {
  it("reads the org billing every member is sent", () => {
    expect(parseOrgBilling(BILLING)).toEqual(BILLING);
  });

  it("reads a legacy org, an older team summary, and junk as null", () => {
    expect(parseOrgBilling(undefined)).toBeNull();
    expect(
      parseOrgBilling({ plan: "team", status: "trialing", seats: 3 }),
    ).toBeNull();
    expect(parseOrgBilling({ ...BILLING, tier: "plus" })).toBeNull();
    expect(parseOrgBilling({ ...BILLING, lockAt: "soon" })).toBeNull();
  });

  it("keeps the state when a later gateway adds a lock reason", () => {
    expect(
      parseOrgBilling({
        ...BILLING,
        lockAt: "2026-11-01T00:00:00Z",
        lockReason: "transfer",
      }),
    ).toEqual({ ...BILLING, lockAt: "2026-11-01T00:00:00Z", lockReason: null });
  });
});

describe("the org list and a create", () => {
  const org = {
    id: "o1",
    slug: "00000000000000aa",
    name: "Acme",
    kind: "team",
    role: "owner",
    memberCount: 3,
    degraded: false,
  };

  it("parses every org's billing and the free slot", () => {
    expect(
      readOrgsList({
        orgs: [{ ...org, billing: BILLING }, org],
        invites: [],
        freeOrg: { available: true, orgSlug: null },
      }),
    ).toEqual({
      orgs: [
        { ...org, billing: BILLING },
        { ...org, billing: null },
      ],
      invites: [],
      freeOrg: { available: true, orgSlug: null },
    });
    expect(readOrgsList({ orgs: [], invites: [] }).freeOrg).toBeNull();
  });

  it("reads a paid create's checkout beside the org", () => {
    expect(readCreatedOrg({ ...org, checkoutUrl: "https://c.test/1" })).toEqual(
      {
        kind: "checkout",
        org: { ...org, billing: null },
        checkoutUrl: "https://c.test/1",
      },
    );
    expect(readCreatedOrg(org)).toEqual({
      kind: "created",
      org: { ...org, billing: null },
    });
  });
});
