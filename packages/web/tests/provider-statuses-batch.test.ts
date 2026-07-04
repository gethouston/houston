import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-650: the settings AI-provider section and the chat model picker probe a
 * dozen provider cards at once. The engine adapter's per-card `providerStatus`
 * used to fetch the WHOLE provider list and keep one entry — so N cards fired N
 * identical round-trips, each proxied to the agent's sandbox in cloud. The
 * batched `providerStatuses` fetches `listProviders()` ONCE and derives every
 * card's status from it. These tests pin that single-round-trip contract.
 */

const listProviders = vi.fn();

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    // Every provider/auth call resolves to the same fake runtime client, so we
    // can count how many times the adapter reaches for the provider list.
    runtimeClientFor: vi.fn(() => ({ listProviders })),
  };
});

import { HoustonClient } from "../src/engine-adapter/client";

beforeEach(() => {
  // cp-mode `providerEngine()` needs a selected agent id; the adapter reads it
  // from localStorage, which the default node test env doesn't provide.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) =>
      k === "houston.pref.last_agent_id" ? "agent-1" : null,
    setItem: () => {},
    removeItem: () => {},
  };
  listProviders.mockReset();
});

afterEach(() => vi.clearAllMocks());

function client() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

test("providerStatuses fetches the provider list ONCE for many cards", async () => {
  listProviders.mockResolvedValue([
    { id: "anthropic", configured: true, activeModel: "claude-sonnet-4-6" },
    { id: "openai-codex", configured: false },
    { id: "opencode", configured: true },
  ]);

  const names = [
    "anthropic",
    "openai", // maps to openai-codex (not configured)
    "opencode",
    "opencode-go", // absent from the list
    "openrouter", // absent from the list
    "not-a-provider", // unmapped id
  ];
  const statuses = await client().providerStatuses(names);

  // The whole point: N cards, ONE round-trip.
  expect(listProviders).toHaveBeenCalledTimes(1);
  expect(statuses.map((s) => s.authState)).toEqual([
    "authenticated",
    "unauthenticated",
    "authenticated",
    "unauthenticated",
    "unauthenticated",
    "unauthenticated",
  ]);
  // Each status echoes the frontend name it was asked about, not the engine id.
  expect(statuses.map((s) => s.provider)).toEqual(names);
  // Dynamic model id (e.g. the local OpenAI-compatible provider) is carried through.
  expect(statuses[0].activeModel).toBe("claude-sonnet-4-6");
});

test("providerStatus delegates to the batch (one fetch, correct entry)", async () => {
  listProviders.mockResolvedValue([{ id: "anthropic", configured: true }]);

  const status = await client().providerStatus("anthropic");

  expect(listProviders).toHaveBeenCalledTimes(1);
  expect(status.authState).toBe("authenticated");
  expect(status.provider).toBe("anthropic");
});

test("an unreachable runtime reports every card not-connected without throwing", async () => {
  listProviders.mockRejectedValue(new Error("sandbox unreachable"));

  const statuses = await client().providerStatuses(["anthropic", "opencode"]);

  expect(statuses.map((s) => s.authState)).toEqual([
    "unauthenticated",
    "unauthenticated",
  ]);
});
