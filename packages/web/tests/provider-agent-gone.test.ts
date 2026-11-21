import { EngineError } from "@houston/runtime-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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

const ctxOf = (c: HoustonClient) =>
  (c as unknown as { ctx: AdapterContext }).ctx;

const PREF = "houston.pref.last_agent_id";
const GHOST = "agent-ghost";
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
  expect(events).toContainEqual({
    type: "AgentsChanged",
    data: { agent_path: undefined, workspace_id: undefined },
  });
  listProviders.mockClear();
  await c.providerStatuses(["anthropic"]);
  expect(listProviders.mock.calls.map((call) => call[0])).toEqual([LIVE]);
});

test("a login launch retries at the next live agent and pins the connect poll to it", async () => {
  const c = await staleClient();

  await c.providerLogin("anthropic");

  expect(startLogin.mock.calls.map((call) => call[0])).toEqual([GHOST, LIVE]);
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
