import { describe, expect, it } from "vitest";
import {
  freeOrgBilling,
  paidOrgBilling,
} from "../billing/org-billing-fixtures";
import { canMoveAgentsOut, moveOutDestinations } from "./move-out";
import type { OrgSummary, OrgsList } from "./types";

const LOCKED = freeOrgBilling({
  status: "locked",
  lockAt: "2026-10-01T00:00:00Z",
  lockReason: "migration",
  freeSlot: false,
});

function org(patch: Partial<OrgSummary> & { slug: string }): OrgSummary {
  return {
    id: `id-${patch.slug}`,
    name: patch.slug,
    kind: "team",
    role: "owner",
    memberCount: 1,
    degraded: false,
    billing: paidOrgBilling(),
    ...patch,
  };
}

const ACME = org({ slug: "acme", name: "Acme", billing: LOCKED });
const PERSONAL = org({
  slug: "mine",
  name: "Daniel",
  kind: "personal",
  billing: freeOrgBilling(),
});
const ZETA = org({ slug: "zeta", name: "Zeta" });
const BETA = org({ slug: "beta", name: "Beta", role: "admin" });

const list = (...orgs: OrgSummary[]): OrgsList => ({
  orgs,
  invites: [],
  freeOrg: null,
});

describe("canMoveAgentsOut", () => {
  it("lets an owner or admin of an org on org billing move agents out, locked or not", () => {
    expect(canMoveAgentsOut(ACME)).toBe(true);
    expect(canMoveAgentsOut({ ...ACME, role: "admin" })).toBe(true);
    expect(canMoveAgentsOut(ZETA)).toBe(true);
  });

  it("refuses a member, a legacy org and an unknown one", () => {
    expect(canMoveAgentsOut({ ...ACME, role: "user" })).toBe(false);
    expect(canMoveAgentsOut({ ...ACME, billing: null })).toBe(false);
    expect(canMoveAgentsOut(null)).toBe(false);
    expect(canMoveAgentsOut(undefined)).toBe(false);
  });
});

describe("moveOutDestinations", () => {
  it("offers every other org the caller runs that works, Personal first", () => {
    expect(
      moveOutDestinations(list(ZETA, ACME, BETA, PERSONAL), ACME.slug),
    ).toEqual([
      { slug: "mine", name: "Daniel", personal: true },
      { slug: "beta", name: "Beta", personal: false },
      { slug: "zeta", name: "Zeta", personal: false },
    ]);
  });

  it("never offers the source, a locked org, an old gateway's degraded team, or one the caller only belongs to", () => {
    const otherLocked = org({ slug: "lock", billing: LOCKED });
    const degraded = org({ slug: "old", billing: null, degraded: true });
    const member = org({ slug: "memb", role: "user" });
    expect(
      moveOutDestinations(list(ACME, otherLocked, degraded, member), ACME.slug),
    ).toEqual([]);
    expect(moveOutDestinations(undefined, ACME.slug)).toEqual([]);
  });
});
