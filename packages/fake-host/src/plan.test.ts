import type { PlanRoutine, PlanSummary } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";
import { FAKE_CHECKOUT_URL } from "./state-plan";

const FREE: PlanSummary = {
  plan: "free",
  usage: { percent: 50, used: 20, limit: 40 },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  announcement: true,
  routines: {
    paused: true,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: true,
    limitedCount: 1,
  },
};

const ROUTINE: PlanRoutine = {
  orgSlug: "personal",
  orgName: "Personal",
  agentSlug: "writer",
  agentName: "Writer",
  routineId: "routine-1",
  kind: "schedule",
  schedule: "0 9 * * *",
  runsLast7d: 3,
  kept: false,
};

describe("C19 personal plan", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const calls = async () =>
    (
      (await (await send("GET", "/__test__/plan-calls")).json()) as {
        calls: { route: string; body?: unknown }[];
      }
    ).calls;

  beforeEach(async () => {
    host = await startFakeHost(0);
    // Host state is process-wide; start every case from the seed.
    await send("POST", "/__test__/reset");
  });
  afterEach(async () => {
    await host.stop();
  });

  it("is off by default: no capability, every plan route 503s", async () => {
    const caps = await (await send("GET", "/v1/capabilities")).json();
    expect(caps).not.toHaveProperty("plan");
    const res = await send("GET", "/v1/me/plan");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
  });

  it("arming advertises the capability and serves the summary", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    expect(await (await send("GET", "/v1/capabilities")).json()).toMatchObject({
      plan: true,
    });
    expect(await (await send("GET", "/v1/me/plan")).json()).toEqual(FREE);
    const checkout = await send("POST", "/v1/me/plus/checkout");
    expect(await checkout.json()).toEqual({ url: FAKE_CHECKOUT_URL });
    const portal = await send("POST", "/v1/me/plus/portal");
    expect(portal.status).toBe(409);
    expect(await portal.json()).toMatchObject({ code: "no_subscription" });
  });

  it("an armed checkout refusal answers the gateway's code and status", async () => {
    for (const [refusal, status] of [
      ["account_deleted", 410],
      ["not_configured", 503],
    ] as const) {
      await send("POST", "/__test__/plan", {
        summary: FREE,
        checkoutRefusal: refusal,
      });
      const res = await send("POST", "/v1/me/plus/checkout");
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code: refusal });
      expect((await calls()).map((call) => call.route)).toEqual(["checkout"]);
    }
  });

  it("mutations persist and land in the ledger", async () => {
    await send("POST", "/__test__/plan", {
      summary: FREE,
      routines: [ROUTINE],
    });
    expect((await send("POST", "/v1/me/plan/announcement")).status).toBe(204);
    const resumed = (await (
      await send("POST", "/v1/me/routines/resume")
    ).json()) as PlanSummary;
    expect(resumed.routines?.paused).toBe(false);
    const missing = await send("PUT", "/v1/me/routines/keep", {
      ...ROUTINE,
      routineId: "nope",
    });
    expect(missing.status).toBe(404);
    const kept = (await (
      await send("PUT", "/v1/me/routines/keep", {
        orgSlug: "personal",
        agentSlug: "writer",
        routineId: "routine-1",
      })
    ).json()) as PlanSummary;
    expect(kept.routines?.needsChoice).toBe(false);
    const plan = (await (
      await send("GET", "/v1/me/plan")
    ).json()) as PlanSummary;
    expect(plan.announcement).toBe(false);
    expect((await calls()).map((c) => c.route)).toEqual([
      "announcement",
      "resume",
      "keep",
      "keep",
      "plan",
    ]);
  });

  it("an armed limit refuses a chat send with 429 message_limit", async () => {
    const resetsAt = new Date(Date.now() + 3_600_000).toISOString();
    await send("POST", "/__test__/plan", {
      summary: FREE,
      messageLimit: { limit: 40, resetsAt },
    });
    const res = await send(
      "POST",
      `/agents/${SEED_AGENT_ID}/conversations/c-1/messages`,
      { text: "hi" },
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(3500);
    expect(await res.json()).toEqual({
      error: "message limit reached",
      code: "message_limit",
      limit: 40,
      resetsAt,
    });
    expect((await calls()).map((c) => c.route)).toEqual(["send"]);
  });

  it("disarming turns the capability and the routes back off", async () => {
    await send("POST", "/__test__/plan", { summary: FREE });
    await send("POST", "/__test__/plan", { summary: null });
    expect(
      await (await send("GET", "/v1/capabilities")).json(),
    ).not.toHaveProperty("plan");
    expect((await send("GET", "/v1/me/plan")).status).toBe(503);
  });
});
