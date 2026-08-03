import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-650: the settings AI-provider section and the chat model picker probe a
 * dozen provider cards at once. The engine adapter's per-card `providerStatus`
 * used to fetch the WHOLE provider list and keep one entry — so N cards fired N
 * identical round-trips, each proxied to the agent's sandbox in cloud. The
 * batched `providerStatuses` fetches `listProviders()` ONCE and derives every
 * card's status from it. These tests pin that single-round-trip contract.
 */

const { listProviders, cpListAgents } = vi.hoisted(() => ({
  listProviders: vi.fn(),
  cpListAgents: vi.fn(),
}));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    listAgents: cpListAgents,
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
  cpListAgents.mockReset();
  cpListAgents.mockResolvedValue([{ id: "agent-1" }]);
});

afterEach(() => vi.clearAllMocks());

/**
 * A client whose ACTIVE SPACE has already listed its agents.
 *
 * Every probe test settles the list first because the probe routes per-agent:
 * until a `listAgents` has resolved for this space, the only candidate id is
 * the persisted pref, which after a space switch still names the PREVIOUS
 * space's agent — so the adapter deliberately reports "unknown" instead of
 * asking a foreign agent's route (HOU-979; the last test pins that).
 */
async function settledClient() {
  const c = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  await c.listAgents("ws");
  return c;
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
  const statuses = await (await settledClient()).providerStatuses(names);

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

  const status = await (await settledClient()).providerStatus("anthropic");

  expect(listProviders).toHaveBeenCalledTimes(1);
  expect(status.authState).toBe("authenticated");
  expect(status.provider).toBe("anthropic");
});

test("an unreachable runtime reports every card UNKNOWN without throwing", async () => {
  // Never a fabricated "unauthenticated": a cold pod waking after an app
  // relaunch/update must not flip connected providers to "Connect" or block
  // the local-model tunnel auto-reconnect (which skips only on a CONFIRMED
  // signed-out state).
  listProviders.mockRejectedValue(new Error("sandbox unreachable"));

  const statuses = await (await settledClient()).providerStatuses([
    "anthropic",
    "opencode",
  ]);

  expect(statuses.map((s) => s.authState)).toEqual(["unknown", "unknown"]);
});

test("the probe is bounded by an abort signal, so a wedged host cannot pend forever", async () => {
  // HOU-1153: a host that accepts the connection but never answers (wedged
  // sidecar, pod stuck mid-boot) left this promise pending for the life of the
  // app — which the picker rendered as a permanent "Loading providers…". The
  // timeout turns it into the ordinary unreachable answer, which the caller
  // classifies as a failure and re-probes.
  listProviders.mockResolvedValue([]);

  await (await settledClient()).providerStatuses(["anthropic"]);

  const [opts] = listProviders.mock.calls[0];
  expect(opts.signal).toBeInstanceOf(AbortSignal);
  expect(opts.signal.aborted).toBe(false);
});

test("a reachable runtime still gives a confirmed unauthenticated for absent providers", async () => {
  listProviders.mockResolvedValue([{ id: "anthropic", configured: true }]);

  const statuses = await (await settledClient()).providerStatuses([
    "anthropic",
    "opencode",
  ]);

  expect(statuses.map((s) => s.authState)).toEqual([
    "authenticated",
    "unauthenticated",
  ]);
});
