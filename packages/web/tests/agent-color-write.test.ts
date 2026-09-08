import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyAgentColor,
  updateAgentColor,
} from "../src/engine-adapter/control-plane";

/**
 * The two color writes. `updateAgentColor` is the single-request host leaf the
 * personal assistant dispatches (the generated catalog derives its route from
 * this exact call shape, so the path, verb and body are load-bearing);
 * `applyAgentColor` is the app picker's write, which sets the device overlay
 * and answers with the refreshed agent.
 */

const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let calls: { url: string; method: string; body: string | null }[];

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(
      JSON.stringify(
        String(input).endsWith("/agents")
          ? [
              {
                id: "Home/Bob",
                workspaceId: "Home",
                name: "Bob",
                createdAt: 0,
              },
            ]
          : { agentId: "Home/Bob", color: "teal" },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

const cfg = () => ({ baseUrl: "http://cp", token: "t" });

test("updateAgentColor PUTs the color to the agent's own color address", async () => {
  await updateAgentColor(cfg(), "Home/Bob", "teal");
  expect(calls).toEqual([
    {
      url: "http://cp/v1/agents/Home%2FBob/color",
      method: "PUT",
      body: '{"color":"teal"}',
    },
  ]);
});

test("updateAgentColor escapes the agent id into one path segment", async () => {
  await updateAgentColor(cfg(), "Home/Bob & Co", "crimson");
  expect(calls[0]?.url).toBe("http://cp/v1/agents/Home%2FBob%20%26%20Co/color");
});

test("the app picker's write sets the overlay and returns the agent", async () => {
  const agent = await applyAgentColor(cfg(), "Home/Bob", "golden");
  expect(agent.color).toBe("golden");
  expect(JSON.parse(store.get("houston.web.cp.agentColors") ?? "{}")).toEqual({
    "Home/Bob": "golden",
  });
});

test("the app picker's write reports an agent the list no longer holds", async () => {
  await expect(applyAgentColor(cfg(), "Home/Gone", "navy")).rejects.toThrow(
    /agent not found/,
  );
});
