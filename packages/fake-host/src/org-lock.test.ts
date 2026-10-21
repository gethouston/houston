import type { OrgBilling, OrgsList, PlanSummary } from "@houston/wire-types";
import { readOrgsList } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";
import { PERSONAL_ORG_SLUG } from "./state-org-billing";
import { FAKE_PORTAL_URL } from "./state-plan";

const FREE: PlanSummary = {
  plan: "free",
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  announcement: false,
};

const TEAM = "00000000000000aa";

function billing(patch: Partial<OrgBilling>): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 2,
    seatPriceCents: 1500,
    seatGraceEndsAt: null,
    usage: null,
    routines: null,
    ...patch,
  };
}

const LOCKED = billing({
  status: "locked",
  lockAt: "2026-10-01T00:00:00.000Z",
  lockReason: "migration",
});

describe("locked orgs on the fake gateway", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown, org?: string) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(org ? { "x-houston-org": org } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const orgs = async (): Promise<OrgsList> =>
    readOrgsList(await (await send("GET", "/v1/orgs")).json());
  const bySlug = async (slug: string) =>
    (await orgs()).orgs.find((o) => o.slug === slug);
  const arm = async (team: OrgBilling, role = "owner") => {
    await send("POST", "/__test__/plan", { summary: FREE });
    await send("POST", "/__test__/workspaces", {
      teams: [
        { slug: TEAM, name: "Acme", billing: team, role, memberCount: 3 },
      ],
    });
  };

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
  });
  afterEach(async () => {
    await host.stop();
  });

  it("serves an armed team's role, member count and lock", async () => {
    await arm(LOCKED, "user");
    expect(await bySlug(TEAM)).toMatchObject({
      role: "user",
      memberCount: 3,
      degraded: true,
      billing: { status: "locked", lockReason: "migration" },
    });
  });

  it("serves the personal org's billing armed whole", async () => {
    await send("POST", "/__test__/plan", {
      summary: FREE,
      personalBilling: billing({ status: "past_due", tier: "paid" }),
      freeOrg: { available: true, orgSlug: null },
    });
    const list = await orgs();
    expect(list.freeOrg).toEqual({ available: true, orgSlug: null });
    expect(list.orgs[0]).toMatchObject({
      slug: PERSONAL_ORG_SLUG,
      degraded: false,
      billing: { status: "past_due", tier: "paid" },
    });
  });

  it("refuses a send and a new agent on a locked org with needs_upgrade", async () => {
    await arm(LOCKED);
    const sent = await send(
      "POST",
      `/agents/${SEED_AGENT_ID}/conversations/c1/messages`,
      { text: "hi" },
      TEAM,
    );
    expect(sent.status).toBe(403);
    expect(await sent.json()).toEqual({
      error: "this organization is locked",
      code: "needs_upgrade",
      reason: "migration",
      lockAt: "2026-10-01T00:00:00.000Z",
    });
    const created = await send("POST", "/agents", { name: "New" }, TEAM);
    expect(created.status).toBe(403);
  });

  it("keeps reads open on a locked org and writes open elsewhere", async () => {
    await arm(LOCKED);
    const read = await send(
      "GET",
      `/agents/${SEED_AGENT_ID}/conversations/c1/messages`,
      undefined,
      TEAM,
    );
    expect(read.status).toBe(200);
    const personal = await send(
      "POST",
      `/agents/${SEED_AGENT_ID}/conversations/c1/messages`,
      { text: "hi" },
    );
    expect(personal.status).not.toBe(403);
  });

  it("swaps the free slot: the team turns free, the personal org locks", async () => {
    await arm(LOCKED);
    const res = await send("POST", "/v1/org/billing/free", undefined, TEAM);
    expect(res.status).toBe(204);
    const list = await orgs();
    expect(list.freeOrg).toEqual({ available: false, orgSlug: TEAM });
    const team = list.orgs.find((o) => o.slug === TEAM);
    expect(team?.billing).toMatchObject({
      status: "active",
      lockAt: null,
      freeSlot: true,
    });
    const personal = list.orgs.find((o) => o.slug === PERSONAL_ORG_SLUG);
    expect(personal).toMatchObject({
      degraded: true,
      billing: { status: "locked", lockReason: "unpaid", freeSlot: false },
    });
  });

  it("refuses the swap for someone who does not pay and for a paid org", async () => {
    await arm({ ...LOCKED, isBillingOwner: false });
    const notOwner = await send(
      "POST",
      "/v1/org/billing/free",
      undefined,
      TEAM,
    );
    expect(notOwner.status).toBe(403);
    expect(await notOwner.json()).toMatchObject({ code: "not_billing_owner" });

    await arm({ ...LOCKED, tier: "paid", lockReason: "payment_failed" });
    const paid = await send("POST", "/v1/org/billing/free", undefined, TEAM);
    expect(paid.status).toBe(409);
    expect(await paid.json()).toMatchObject({ code: "has_subscription" });
    expect((await bySlug(TEAM))?.billing?.status).toBe("locked");
  });

  it("answers the billing owner's portal and records the call", async () => {
    await arm(billing({ tier: "paid", status: "past_due" }));
    const res = await send("POST", "/v1/org/billing/portal", undefined, TEAM);
    expect(await res.json()).toEqual({ url: FAKE_PORTAL_URL });
    const { calls } = (await (
      await send("GET", "/__test__/plan-calls")
    ).json()) as { calls: unknown[] };
    expect(calls).toEqual([{ route: "org_portal", body: { orgSlug: TEAM } }]);
  });
});
