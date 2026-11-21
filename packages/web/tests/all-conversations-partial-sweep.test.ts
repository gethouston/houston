import { HoustonClient } from "@houston/engine-adapter/client";
import { AGENT_FAN_OUT_LIMIT } from "@houston/sdk";
import { afterEach, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

const activity = (id: string, title: string) => ({
  id,
  title,
  description: "",
  status: "needs_you",
  updated_at: "2026-01-01T00:00:00.000Z",
});

function stubAgentReads(byAgent: Record<string, unknown[] | number>) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const agent = url.match(/\/agents\/([^/]+)\/activities$/)?.[1];
    const served = agent ? byAgent[decodeURIComponent(agent)] : undefined;
    if (served === undefined) throw new TypeError("not stubbed");
    if (typeof served === "number")
      return new Response(JSON.stringify({ error: "agent unreachable" }), {
        status: served,
        headers: { "Content-Type": "application/json" },
      });
    return new Response(JSON.stringify({ items: served }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };
const client = () => new HoustonClient({ ...CFG, controlPlane: true });

test("a complete sweep reports no failures", async () => {
  stubAgentReads({
    maya: [activity("a1", "Plan a trip to Tokyo")],
    kai: [activity("b1", "Draft the launch email")],
  });

  const result = await client().listAllConversations(["maya", "kai"]);

  expect(result.failedAgents).toEqual([]);
  expect(result.conversations.map((c) => c.title)).toEqual([
    "Plan a trip to Tokyo",
    "Draft the launch email",
  ]);
});

test("one unreachable agent no longer blanks the whole board", async () => {
  stubAgentReads({
    maya: [activity("a1", "Plan a trip to Tokyo")],
    kai: 500,
  });

  const result = await client().listAllConversations(["maya", "kai"]);

  expect(result.conversations.map((c) => c.title)).toEqual([
    "Plan a trip to Tokyo",
  ]);
  expect(result.failedAgents.map((f) => f.agentPath)).toEqual(["kai"]);
  const reason = result.failedAgents[0].reason as Error & { status?: number };
  expect(reason.name).toBe("HoustonEngineError");
  expect(reason.status).toBe(500);
  expect(reason.message).toBe("agent unreachable (engine error 500)");
});

test("the healthy agents' rows survive regardless of fan-out order", async () => {
  stubAgentReads({
    maya: 500,
    kai: [activity("b1", "Draft the launch email")],
    rex: [activity("c1", "Book the venue")],
  });

  const result = await client().listAllConversations(["maya", "kai", "rex"]);

  expect(result.conversations.map((c) => c.id)).toEqual(["b1", "c1"]);
  expect(result.failedAgents.map((f) => f.agentPath)).toEqual(["maya"]);
});

test("a sweep where EVERY agent failed is a failure, not an empty board", async () => {
  stubAgentReads({ maya: 500, kai: 500 });

  await expect(client().listAllConversations(["maya", "kai"])).rejects.toThrow(
    "agent unreachable (engine error 500)",
  );
});

test("an empty roster sweeps to an empty, COMPLETE answer", async () => {
  stubAgentReads({});

  await expect(client().listAllConversations([])).resolves.toEqual({
    conversations: [],
    failedAgents: [],
  });
});

function stubSlowReads(ms = 1) {
  const load = { inFlight: 0, peak: 0, calls: 0 };
  globalThis.fetch = vi.fn(async () => {
    load.calls++;
    load.inFlight++;
    load.peak = Math.max(load.peak, load.inFlight);
    await new Promise((r) => setTimeout(r, ms));
    load.inFlight--;
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return load;
}

const rosterOf = (n: number, prefix = "agent") =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

test("a large roster is read a few agents at a time, not all at once", async () => {
  const load = stubSlowReads();
  const roster = rosterOf(40);

  const result = await client().listAllConversations(roster);

  expect(result.failedAgents).toEqual([]);
  expect(load.calls).toBe(roster.length);
  expect(load.peak).toBeLessThanOrEqual(AGENT_FAN_OUT_LIMIT);
  expect(load.peak).toBeGreaterThan(1);
});

test("the bound holds across a bearer rotation mid-sweep", async () => {
  const load = stubSlowReads(5);
  const c = client();
  const first = c.listAllConversations(rosterOf(30, "first"));
  c.setEndpoint({ ...CFG, token: "rotated" });
  const second = c.listAllConversations(rosterOf(30, "second"));

  await Promise.all([first, second]);

  expect(load.calls).toBe(60);
  expect(load.peak).toBeLessThanOrEqual(AGENT_FAN_OUT_LIMIT);
});

test("an aborted sweep drops its queued reads and rejects", async () => {
  const load = stubSlowReads(5);
  const controller = new AbortController();
  const sweep = client().listAllConversations(rosterOf(40), {
    signal: controller.signal,
  });
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();

  await expect(sweep).rejects.toThrow();
  await new Promise((r) => setTimeout(r, 20));
  expect(load.calls).toBe(AGENT_FAN_OUT_LIMIT);
});
