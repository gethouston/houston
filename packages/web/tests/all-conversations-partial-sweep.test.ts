import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * HOU-981, the fan-out half.
 *
 * The cross-agent sweep is one `GET /agents/:id/activities` per agent. It used
 * to run under `Promise.all`, so ONE agent's failed read rejected the whole
 * sweep — a single pod that never woke blanked Mission Control, the sidebar
 * badges and the command palette for every other agent, and (because the query
 * layer's placeholder only covers the pending state) the board rendered EMPTY
 * rather than showing the cached missions.
 *
 * `allSettled` keeps whoever answered and names whoever did not, so the query
 * layer can carry the failed agents' last-known rows and re-sweep. A sweep
 * where EVERY agent failed is still a failure and still throws.
 */

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

/** Serve `/agents/:id/activities` per agent: rows, or a status to fail with. */
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

  expect(result.failedAgentPaths).toEqual([]);
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
  // Named, never silently dropped — this is what the query layer recovers from.
  expect(result.failedAgentPaths).toEqual(["kai"]);
});

test("the healthy agents' rows survive regardless of fan-out order", async () => {
  stubAgentReads({
    maya: 500,
    kai: [activity("b1", "Draft the launch email")],
    rex: [activity("c1", "Book the venue")],
  });

  const result = await client().listAllConversations(["maya", "kai", "rex"]);

  expect(result.conversations.map((c) => c.id)).toEqual(["b1", "c1"]);
  expect(result.failedAgentPaths).toEqual(["maya"]);
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
    failedAgentPaths: [],
  });
});
