import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * Credentials are workspace-central (connect-once), so provider connects don't
 * need an agent — but cp-mode `providerEngine()` routes them through the agent
 * remembered in `houston.pref.last_agent_id` whenever that pref is set. A STALE
 * pref (deleted last agent, wiped user data, account switch on the same
 * browser) sent first-run onboarding logins to `/agents/<dead>/auth/:pid/login`
 * → 404 "agent not found" instead of the pre-agent `/setup-runtime` surface.
 *
 * The invariant under test: the pref never outlives its agent. `listAgents`
 * (which boot runs before any connect surface mounts) prunes a pref naming an
 * agent the control plane doesn't have, and `deleteAgent` clears the pref when
 * the deleted agent was the remembered one.
 */

const { cpListAgents, cpDeleteAgent, runtimeClientFor, setupRuntimeClientFor } =
  vi.hoisted(() => ({
    cpListAgents: vi.fn(),
    cpDeleteAgent: vi.fn(),
    runtimeClientFor: vi.fn(),
    setupRuntimeClientFor: vi.fn(),
  }));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    listAgents: cpListAgents,
    deleteAgent: cpDeleteAgent,
    runtimeClientFor,
    setupRuntimeClientFor,
  };
});

import { HoustonClient } from "../src/engine-adapter/client";
import { DEFAULT_AGENT_ID } from "../src/engine-adapter/synthetic";

const PREF = "houston.pref.last_agent_id";

let store: Map<string, string>;

beforeEach(() => {
  // Freeze timers so pollProviderConnect's 4s poll loop never fires mid-test.
  vi.useFakeTimers();
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  cpListAgents.mockReset();
  cpDeleteAgent.mockReset();
  runtimeClientFor.mockReset();
  setupRuntimeClientFor.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function client() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

const agent = (id: string) => ({
  id,
  name: id,
  folderPath: id,
  configId: "c",
  color: "#000",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
});

test("listAgents prunes a pref naming an agent the control plane doesn't have", async () => {
  store.set(PREF, "ws/Deleted Agent");
  cpListAgents.mockResolvedValue([agent("ws/Other")]);

  await client().listAgents("ws");

  expect(store.has(PREF)).toBe(false);
});

test("listAgents keeps a pref naming an existing agent", async () => {
  store.set(PREF, "ws/Alive");
  cpListAgents.mockResolvedValue([agent("ws/Alive"), agent("ws/Other")]);

  await client().listAgents("ws");

  expect(store.get(PREF)).toBe("ws/Alive");
});

test("listAgents leaves the synthetic default-agent sentinel alone", async () => {
  store.set(PREF, DEFAULT_AGENT_ID);
  cpListAgents.mockResolvedValue([]);

  await client().listAgents("ws");

  expect(store.get(PREF)).toBe(DEFAULT_AGENT_ID);
});

test("deleteAgent clears the pref when the deleted agent was the remembered one", async () => {
  store.set(PREF, "ws/Doomed");
  cpDeleteAgent.mockResolvedValue(undefined);

  await client().deleteAgent("ws", "ws/Doomed");

  expect(store.has(PREF)).toBe(false);
});

test("deleteAgent keeps the pref when another agent was deleted", async () => {
  store.set(PREF, "ws/Kept");
  cpDeleteAgent.mockResolvedValue(undefined);

  await client().deleteAgent("ws", "ws/Doomed");

  expect(store.get(PREF)).toBe("ws/Kept");
});

test("regression: after boot prunes a stale pref, first-run login runs on the SETUP runtime, not the dead agent's", async () => {
  store.set(PREF, "ws/Deleted Agent");
  cpListAgents.mockResolvedValue([]); // fresh install: zero agents → onboarding
  const startLogin = vi.fn().mockResolvedValue({
    kind: "device_code",
    verificationUri: "https://auth.example/device",
    userCode: "ABCD-1234",
  });
  setupRuntimeClientFor.mockReturnValue({ startLogin });
  runtimeClientFor.mockReturnValue({
    startLogin: vi.fn().mockRejectedValue(new Error("agent not found")),
  });

  const c = client();
  await c.listAgents("ws"); // boot's load pass
  await c.providerLogin("openai");

  expect(setupRuntimeClientFor).toHaveBeenCalled();
  expect(runtimeClientFor).not.toHaveBeenCalled();
  expect(startLogin).toHaveBeenCalledTimes(1);
});
