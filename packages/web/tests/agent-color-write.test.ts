import { applyAgentColor } from "@houston/engine-adapter/control-plane";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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
