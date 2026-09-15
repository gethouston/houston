import { EngineError } from "@houston/runtime-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * HOUSTON-APP-52F — a provider call routed at an agent the gateway no longer
 * has (`404 {"error":"agent not found"}`) must forget that agent and retry at
 * the space's next live runtime, instead of failing the Reconnect card loudly
 * and re-probing the same dead pod for the whole session.
 *
 * The known list goes stale in ordinary use: a rename mints a NEW id, a delete
 * on this or another device removes one. With the selection pref re-pointed at
 * an id the list does not contain, `providerAgentId()` fell back to `ids[0]`
 * — the stale entry — and every provider call went there.
 */

const { listProviders, startLogin, runtimeClientFor } = vi.hoisted(() => ({
  listProviders: vi.fn<(agentId: string) => Promise<unknown[]>>(),
  startLogin: vi.fn<(agentId: string) => Promise<unknown>>(),
  runtimeClientFor: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    // One fake runtime client PER agent id, so a test can make exactly one
    // agent answer "gone" and assert which id the retry landed on.
    runtimeClientFor: runtimeClientFor.mockImplementation(
      (_cfg: unknown, agentId: string) => ({
        listProviders: () => listProviders(agentId),
        startLogin: () => startLogin(agentId),
      }),
    ),
    setupRuntimeClientFor: () => ({
      listProviders: () => listProviders("setup"),
      startLogin: () => startLogin("setup"),
    }),
  };
});

import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import type { AdapterContext } from "@houston/engine-adapter/client/context";
import { isProviderAgentGoneError } from "@houston/engine-adapter/client/provider-agent-gone";
import {
  restoreAgentListFetch,
  stubAgentListFetch,
  wireAgent,
} from "./support/agent-list";

/** The (protected) shared context, for asserting on routing state. */
const ctxOf = (c: HoustonClient) =>
  (c as unknown as { ctx: AdapterContext }).ctx;

const PREF = "houston.pref.last_agent_id";
/** The agent the last `listAgents` knew — deleted/renamed since. */
const GHOST = "agent-ghost";
/** The agent that exists now. */
const LIVE = "agent-live";

const gone = () =>
  new EngineError(404, JSON.stringify({ error: "agent not found" }));

let store: Map<string, string>;

beforeEach(() => {
  store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  listProviders.mockReset().mockImplementation(async (agentId) => {
    if (agentId === GHOST) throw gone();
    return [{ id: "anthropic", configured: true }];
  });
  startLogin.mockReset().mockImplementation(async (agentId) => {
    if (agentId === GHOST) throw gone();
    return { kind: "device_code", verificationUri: "https://x", userCode: "1" };
  });
  runtimeClientFor.mockClear();
});

afterEach(() => {
  restoreAgentListFetch();
  vi.clearAllMocks();
});

/** A client whose known list is stale: it still names the ghost first. */
async function staleClient(ids: string[] = [GHOST, LIVE]) {
  const c = new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
  stubAgentListFetch(ids.map((id) => wireAgent(id)));
  await c.listAgents("ws");
  return c;
}

test("classifier: only a 404 whose body says the agent is gone", () => {
  expect(isProviderAgentGoneError(gone())).toBe(true);
  expect(
    isProviderAgentGoneError(
      new EngineError(404, JSON.stringify({ error: "not found" })),
    ),
  ).toBe(false);
  expect(
    isProviderAgentGoneError(
      new EngineError(403, JSON.stringify({ error: "agent not found" })),
    ),
  ).toBe(false);
  expect(
    isProviderAgentGoneError(new EngineError(404, "agent not found")),
  ).toBe(false);
  expect(isProviderAgentGoneError(new Error("agent not found"))).toBe(false);
});

test("the status probe forgets the ghost and answers from the next live agent", async () => {
  const c = await staleClient();
  const events: unknown[] = [];
  const off = bus.on((ev) => events.push(ev));

  const statuses = await c.providerStatuses(["anthropic"]);
  off();

  expect(statuses[0].authState).toBe("authenticated");
  expect(listProviders.mock.calls.map((call) => call[0])).toEqual([
    GHOST,
    LIVE,
  ]);
  // The app's roster is told to re-list, so the ghost leaves the rail too.
  expect(events).toContainEqual({
    type: "AgentsChanged",
    data: { agent_path: undefined, workspace_id: undefined },
  });
  // The ghost is gone from routing: the NEXT probe never asks it again.
  listProviders.mockClear();
  await c.providerStatuses(["anthropic"]);
  expect(listProviders.mock.calls.map((call) => call[0])).toEqual([LIVE]);
});

test("a login launch retries at the next live agent and pins the connect poll to it", async () => {
  const c = await staleClient();

  await c.providerLogin("anthropic");

  expect(startLogin.mock.calls.map((call) => call[0])).toEqual([GHOST, LIVE]);
  // `activeLogins` is keyed by the agent that actually served the login, so
  // the submit/cancel side lands on the same runtime (HOU-1113).
  expect([...ctxOf(c).activeLogins]).toEqual([`${LIVE}:anthropic`]);
});

test("the selected pref is dropped with the ghost, so it is never re-chosen", async () => {
  store.set(PREF, GHOST);
  const c = await staleClient();

  await c.providerStatuses(["anthropic"]);

  expect(store.get(PREF)).toBeUndefined();
});

test("with no live agent left the retry falls back to the setup runtime", async () => {
  const c = await staleClient([GHOST]);

  await c.providerLogin("anthropic");

  expect(startLogin.mock.calls.map((call) => call[0])).toEqual([
    GHOST,
    "setup",
  ]);
});

test("a second gone answer is final: the launch fails loudly, the probe reports unknown", async () => {
  listProviders.mockRejectedValue(gone());
  startLogin.mockRejectedValue(gone());
  const c = await staleClient();

  await expect(c.providerLogin("anthropic")).rejects.toThrow(/agent not found/);
  expect(startLogin).toHaveBeenCalledTimes(2);

  const statuses = await c.providerStatuses(["anthropic"]);
  expect(statuses[0].authState).toBe("unknown");
});

test("any other launch failure is not retried", async () => {
  startLogin.mockRejectedValue(new EngineError(503, "engine unavailable"));
  const c = await staleClient();

  await expect(c.providerLogin("anthropic")).rejects.toThrow(/503/);
  expect(startLogin).toHaveBeenCalledTimes(1);
});

test("the adapter's own rename moves routing to the new id before any re-list", async () => {
  const c = await staleClient([GHOST]);
  // The SDK write mints a new id for the renamed agent.
  Object.assign(ctxOf(c).sdk.agents.writes, {
    rename: async () => ({
      id: LIVE,
      workspaceId: "ws",
      name: "New",
      createdAt: Date.now(),
    }),
  });

  await c.renameAgent("ws", GHOST, "New");

  expect(ctxOf(c).providerAgentId()).toBe(LIVE);
  expect(ctxOf(c).agentList).toEqual({ kind: "known", ids: [LIVE] });
});

test("the adapter's own delete removes the id from routing", async () => {
  const c = await staleClient([GHOST, LIVE]);
  Object.assign(ctxOf(c).sdk.agents.writes, { delete: async () => undefined });

  await c.deleteAgent("ws", GHOST);

  expect(ctxOf(c).providerAgentId()).toBe(LIVE);
});
