import type { OrgBilling, PlanSummary } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID, SEED_AGENT_NAME } from "./config";
import { type FakeHost, startFakeHost } from "./server";
import { PERSONAL_ORG_SLUG } from "./state-org-billing";

const FREE: PlanSummary = {
  plan: "free",
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  announcement: false,
};

const ACME = "00000000000000aa";
const BETA = "00000000000000bb";

const billing = (status: OrgBilling["status"]): OrgBilling => ({
  tier: "free",
  status,
  lockAt: status === "locked" ? "2026-10-01T00:00:00.000Z" : null,
  lockReason: status === "locked" ? "migration" : null,
  freeSlot: false,
  isBillingOwner: true,
  seats: 1,
  interval: null,
  seatPriceCents: 2000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: null,
  priceNotice: null,
  usage: null,
  routines: null,
});

describe("moving an agent between orgs on the fake gateway", () => {
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
  const names = async (org?: string): Promise<string[]> =>
    (
      (await (await send("GET", "/agents", undefined, org)).json()) as {
        name: string;
      }[]
    ).map((agent) => agent.name);
  const move = (to: string) =>
    send("POST", `/v1/agents/${SEED_AGENT_ID}/move`, { to }, ACME);

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
    await send("POST", "/__test__/plan", { summary: FREE });
    await send("POST", "/__test__/workspaces", {
      teams: [
        { slug: ACME, name: "Acme", billing: billing("locked"), role: "owner" },
        { slug: BETA, name: "Beta", billing: billing("active"), role: "owner" },
      ],
    });
  });
  afterEach(async () => {
    await host.stop();
  });

  it("moves an agent out of a locked org into Personal, where alone it lists", async () => {
    expect(await names(ACME)).toContain(SEED_AGENT_NAME);
    const started = await move(PERSONAL_ORG_SLUG);
    expect(started.status).toBe(202);
    const { moveId } = (await started.json()) as { moveId: string };
    const poll = await send(
      "GET",
      `/v1/agents/${SEED_AGENT_ID}/move/${moveId}`,
    );
    expect(await poll.json()).toEqual({ status: "done" });
    expect(await names()).toContain(SEED_AGENT_NAME);
    expect(await names(ACME)).not.toContain(SEED_AGENT_NAME);
  });

  it("moves an agent into a working team", async () => {
    expect((await move(BETA)).status).toBe(202);
    expect(await names(BETA)).toContain(SEED_AGENT_NAME);
    expect(await names()).not.toContain(SEED_AGENT_NAME);
  });

  it("refuses a locked destination and an org the caller is not in", async () => {
    await send("POST", "/__test__/workspaces", {
      teams: [
        { slug: ACME, name: "Acme", billing: billing("active"), role: "owner" },
        { slug: BETA, name: "Beta", billing: billing("locked"), role: "owner" },
      ],
    });
    const locked = await move(BETA);
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: "needs_upgrade" });
    const stranger = await move("0000000000000ccc");
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toMatchObject({ code: "unsupported_move" });
    expect(await names(ACME)).toContain(SEED_AGENT_NAME);
  });

  it("answers a move into the org the agent already lives in as done", async () => {
    expect((await move(BETA)).status).toBe(202);
    const again = await move(BETA);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "agent_moved" });
    expect(await names(BETA)).toContain(SEED_AGENT_NAME);
  });
});
