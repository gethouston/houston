import { EngineError } from "@houston/runtime-client";
import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { messageLimitRefusal } from "../turns/turn-errors";
import { PlanCommand } from "./index";
import {
  freeScheduleAllowed,
  planDialog,
  presenceDue,
  usagePercent,
} from "./model";

const summary = {
  plan: "free" as const,
  announcement: false,
  usage: { percent: 85, used: 34, limit: 40 },
  plus: {
    status: "none" as const,
    manageable: false,
    price: { amount: 1500, currency: "USD", interval: "month" as const },
  },
  routines: {
    paused: true,
    maxActive: 1 as const,
    minIntervalMinutes: 15 as const,
    needsChoice: true,
    limitedCount: 1,
  },
};

function sdk() {
  const calls: { url: string; method: string; body: string | null }[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Response(JSON.stringify(summary), { status: 200 });
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = {
    baseUrl: "https://gw.example",
    ports,
    reactivity: false,
  };
  return { client: new HoustonSdk(config), calls };
}

describe("plan commands", () => {
  it("dismisses the launch announcement through facade and command", async () => {
    const { client, calls } = sdk();
    await client.plan.dismissPlanAnnouncement();
    expect(
      (
        await client.dispatch({
          id: "dismiss",
          type: PlanCommand.DismissAnnouncement,
        })
      ).ok,
    ).toBe(true);
    expect(calls).toEqual([
      {
        url: "https://gw.example/v1/me/plan/announcement",
        method: "POST",
        body: null,
      },
      {
        url: "https://gw.example/v1/me/plan/announcement",
        method: "POST",
        body: null,
      },
    ]);
  });
  it("lists invoices through the facade and command on the same route", async () => {
    const { client, calls } = sdk();
    await client.plan.listPlusInvoices();
    const result = await client.dispatch({
      id: "invoices",
      type: PlanCommand.ListInvoices,
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      {
        url: "https://gw.example/v1/me/plus/invoices",
        method: "GET",
        body: null,
      },
      {
        url: "https://gw.example/v1/me/plus/invoices",
        method: "GET",
        body: null,
      },
    ]);
  });
  it("uses the same handler for facade and dispatch", async () => {
    const { client, calls } = sdk();
    expect(await client.plan.getPlan()).toEqual(summary);
    expect(
      await client.dispatch({ id: "1", type: PlanCommand.Get }),
    ).toMatchObject({ ok: true, value: summary });
    expect(calls.map((call) => call.url)).toEqual([
      "https://gw.example/v1/me/plan",
      "https://gw.example/v1/me/plan",
    ]);
  });
  it("rejects an incomplete keep key before sending", async () => {
    const { client, calls } = sdk();
    expect(
      (
        await client.dispatch({
          id: "1",
          type: PlanCommand.KeepRoutine,
          payload: { routineId: "r1" },
        })
      ).ok,
    ).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("personal plan decisions", () => {
  it("shows only a clamped percentage and gates dialogs", () => {
    expect(usagePercent(summary)).toBe(85);
    expect(planDialog(summary, false)).toBe("resume");
    expect(planDialog(summary, true)).toBe("keep");
    expect(planDialog({ ...summary, plan: "plus" }, false)).toBeNull();
  });
  it("throttles presence and refuses short Free intervals", () => {
    expect(presenceDue(100, 600_099)).toBe(false);
    expect(presenceDue(100, 600_100)).toBe(true);
    expect(freeScheduleAllowed("*/5 * * * *", summary)).toBe(false);
    expect(freeScheduleAllowed("*/15 * * * *", summary)).toBe(true);
  });
});

describe("message limit", () => {
  it("recognizes only a 429 with the typed C19 body", () => {
    const body = {
      error: "message limit reached",
      code: "message_limit",
      limit: 40,
      resetsAt: "2026-10-01T00:00:00Z",
    };
    expect(
      messageLimitRefusal(new EngineError(429, JSON.stringify(body))),
    ).toEqual(body);
    expect(
      messageLimitRefusal(
        new EngineError(429, JSON.stringify({ code: "rate_limited" })),
      ),
    ).toBeNull();
    expect(
      messageLimitRefusal(new EngineError(503, JSON.stringify(body))),
    ).toBeNull();
  });
});
