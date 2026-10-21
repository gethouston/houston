import { describe, expect, it } from "vitest";
import {
  freeOrgBilling,
  paidOrgBilling,
} from "../billing/org-billing-fixtures";
import {
  activeOrg,
  activeOrgBilling,
  activeSpaceOrgSlug,
} from "./active-space";
import type { OrgSummary, OrgsList } from "./types";

function org(slug: string, kind: OrgSummary["kind"]): OrgSummary {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    kind,
    role: "owner",
    memberCount: 1,
    degraded: false,
    billing: kind === "personal" ? freeOrgBilling() : paidOrgBilling(),
  };
}

const MEMBERSHIPS: OrgsList = {
  orgs: [org("aaaaaaaaaaaaaaaa", "team"), org("383369a239383fee", "personal")],
  invites: [],
  freeOrg: null,
};

describe("activeSpaceOrgSlug", () => {
  it("answers the pinned team slug without reading memberships", () => {
    expect(activeSpaceOrgSlug("5f2b225f316c6079", undefined)).toBe(
      "5f2b225f316c6079",
    );
  });

  it("answers the personal membership's slug when no team is pinned", () => {
    expect(activeSpaceOrgSlug(null, MEMBERSHIPS)).toBe("383369a239383fee");
  });

  it("answers null while the memberships are unread", () => {
    expect(activeSpaceOrgSlug(null, undefined)).toBeNull();
  });

  it("answers null when no membership is personal", () => {
    const teamsOnly: OrgsList = {
      orgs: [org("aaaaaaaaaaaaaaaa", "team")],
      invites: [],
      freeOrg: null,
    };
    expect(activeSpaceOrgSlug(null, teamsOnly)).toBeNull();
  });
});

describe("activeOrgBilling", () => {
  it("reads the pinned team's billing, else the personal org's", () => {
    expect(activeOrgBilling("aaaaaaaaaaaaaaaa", MEMBERSHIPS)).toEqual(
      paidOrgBilling(),
    );
    expect(activeOrgBilling(null, MEMBERSHIPS)).toEqual(freeOrgBilling());
  });

  it("is undefined while unread and null for an unknown or legacy org", () => {
    expect(activeOrgBilling(null, undefined)).toBeUndefined();
    expect(activeOrgBilling("bbbbbbbbbbbbbbbb", MEMBERSHIPS)).toBeNull();
    const legacy: OrgsList = {
      ...MEMBERSHIPS,
      orgs: [{ ...org("aaaaaaaaaaaaaaaa", "team"), billing: null }],
    };
    expect(activeOrgBilling("aaaaaaaaaaaaaaaa", legacy)).toBeNull();
  });
});

describe("activeOrg", () => {
  it("reads the pinned team's membership, else the personal one", () => {
    expect(activeOrg("aaaaaaaaaaaaaaaa", MEMBERSHIPS)?.kind).toBe("team");
    expect(activeOrg(null, MEMBERSHIPS)?.slug).toBe("383369a239383fee");
  });

  it("is undefined while unread and null for an unknown org", () => {
    expect(activeOrg(null, undefined)).toBeUndefined();
    expect(activeOrg("bbbbbbbbbbbbbbbb", MEMBERSHIPS)).toBeNull();
  });
});
