import type { OrgsList, PlanSummary } from "@houston/wire-types";
import { readOrgsList } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";
import { PERSONAL_ORG_SLUG } from "./state-org-billing";
import { FAKE_CHECKOUT_URL } from "./state-plan";

const FREE: PlanSummary = {
  plan: "free",
  usage: {
    percent: 50,
    used: 20,
    limit: 40,
    resetsAt: "2026-10-07T17:00:00.000Z",
  },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  announcement: false,
  routines: {
    paused: true,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: false,
    limitedCount: 0,
    kept: { orgSlug: "personal", agentSlug: "writer", routineId: "r1" },
  },
};

describe("org billing on the fake gateway", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const orgs = async (): Promise<OrgsList> =>
    readOrgsList(await (await send("GET", "/v1/orgs")).json());

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
  });
  afterEach(async () => {
    await host.stop();
  });

  it("lists no personal org and no free slot while the plan is off", async () => {
    expect(await orgs()).toEqual({ orgs: [], invites: [], freeOrg: null });
  });

  it("hands out the org's checkout and portal while the plan is armed", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    const checkout = await send("POST", "/v1/org/billing/checkout", {});
    expect(await checkout.json()).toEqual({ url: FAKE_CHECKOUT_URL });
    const portal = await send("POST", "/v1/org/billing/portal");
    expect(portal.status).toBe(200);
    const calls = await (await send("GET", "/__test__/plan-calls")).json();
    expect(calls.calls.map((call: { route: string }) => call.route)).toEqual([
      "checkout",
      "portal",
    ]);
  });

  it("records a yearly checkout and refuses an interval it does not sell", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    const yearly = await send("POST", "/v1/org/billing/checkout", {
      interval: "year",
    });
    expect(yearly.status).toBe(200);
    const weekly = await send("POST", "/v1/org/billing/checkout", {
      interval: "week",
    });
    expect(weekly.status).toBe(400);
    const calls = await (await send("GET", "/__test__/plan-calls")).json();
    expect(calls.calls).toEqual([
      {
        route: "checkout",
        body: { orgSlug: PERSONAL_ORG_SLUG, interval: "year" },
      },
    ]);
  });

  it("serves the armed plan as the personal org's billing", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    const list = await orgs();
    expect(list.freeOrg).toEqual({
      available: false,
      orgSlug: PERSONAL_ORG_SLUG,
    });
    expect(list.orgs).toEqual([
      expect.objectContaining({
        slug: PERSONAL_ORG_SLUG,
        kind: "personal",
        billing: expect.objectContaining({
          tier: "free",
          status: "active",
          usage: {
            scope: "org",
            used: 20,
            limit: 40,
            resetsAt: "2026-10-07T17:00:00.000Z",
          },
          routines: expect.objectContaining({
            paused: true,
            kept: { agentSlug: "writer", routineId: "r1" },
          }),
        }),
      }),
    ]);
  });

  it("reflects a resume on the next read", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    await send("POST", "/v1/me/routines/resume");
    const [personal] = (await orgs()).orgs;
    expect(personal.billing?.routines?.paused).toBe(false);
  });

  it("refuses a free create while the slot is taken, creating nothing", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    const res = await send("POST", "/v1/orgs", { name: "Acme", plan: "free" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "free_org_taken",
      freeOrgSlug: PERSONAL_ORG_SLUG,
    });
    expect((await orgs()).orgs).toHaveLength(1);
  });

  it("answers a paid create with a locked org and its checkout", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    const res = await send("POST", "/v1/orgs", { name: "Acme", plan: "paid" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: "Acme",
      degraded: true,
      checkoutUrl: FAKE_CHECKOUT_URL,
      billing: { status: "locked", lockReason: "unpaid" },
    });
  });

  it("a free create while the slot is open takes it, so the next is refused", async () => {
    await send("POST", "/__test__/plan", {
      summary: { ...FREE, plan: "plus", usage: undefined },
    });
    expect((await orgs()).freeOrg).toEqual({ available: true, orgSlug: null });
    const first = await send("POST", "/v1/orgs", {
      name: "Acme",
      plan: "free",
    });
    expect(first.status).toBe(201);
    const created = (await first.json()) as { slug: string };
    expect(created).toMatchObject({
      billing: { tier: "free", freeSlot: true },
    });
    expect((await orgs()).freeOrg).toEqual({
      available: false,
      orgSlug: created.slug,
    });
    const second = await send("POST", "/v1/orgs", {
      name: "Beta",
      plan: "free",
    });
    expect(second.status).toBe(409);
  });

  it("creates freely with no plan armed, as a gateway without org billing", async () => {
    const res = await send("POST", "/v1/orgs", { name: "Acme" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Acme", billing: null });
  });

  it("carries a team row's armed billing onto its org", async () => {
    const billing = { ...(await armedBilling()), tier: "paid", usage: null };
    await send("POST", "/__test__/workspaces", {
      teams: [{ slug: "00000000000000aa", name: "Acme", billing }],
    });
    const [team] = (await orgs()).orgs;
    expect(team.billing).toEqual({ ...billing, routines: billing.routines });
  });

  it("adds the scope to a refused send when the seed carries one", async () => {
    await send("POST", "/__test__/plan", {
      summary: FREE,
      messageLimit: {
        limit: 40,
        resetsAt: "2026-10-07T17:00:00.000Z",
        scope: "org",
      },
    });
    const { planMessageRefusal } = await import("./routes-plan");
    expect(await planMessageRefusal()?.json()).toMatchObject({
      code: "message_limit",
      scope: "org",
    });
  });

  async function armedBilling() {
    await send("POST", "/__test__/plan", { summary: FREE });
    const [personal] = (await orgs()).orgs;
    await send("POST", "/__test__/plan", { summary: null });
    if (!personal.billing) throw new Error("no billing");
    return personal.billing;
  }
});
