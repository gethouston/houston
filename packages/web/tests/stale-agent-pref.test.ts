import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { runtimeClientFor, setupRuntimeClientFor } = vi.hoisted(() => ({
  runtimeClientFor: vi.fn(),
  setupRuntimeClientFor: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return { ...actual, runtimeClientFor, setupRuntimeClientFor };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import { DEFAULT_AGENT_ID } from "@houston/engine-adapter/synthetic";

const PREF = "houston.pref.last_agent_id";
const originalFetch = globalThis.fetch;

let store: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  runtimeClientFor.mockReset();
  setupRuntimeClientFor.mockReset();
  listReturns();
});

function listReturns(...agents: { id: string }[]) {
  globalThis.fetch = vi.fn(async (input: unknown) =>
    String(input).endsWith("/agents")
      ? new Response(JSON.stringify(agents), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  globalThis.fetch = originalFetch;
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
  workspaceId: "ws",
  createdAt: 0,
});

test("listAgents prunes a pref naming an agent the control plane doesn't have", async () => {
  store.set(PREF, "ws/Deleted Agent");
  listReturns(agent("ws/Other"));

  await client().listAgents("ws");

  expect(store.has(PREF)).toBe(false);
});

test("listAgents keeps a pref naming an existing agent", async () => {
  store.set(PREF, "ws/Alive");
  listReturns(agent("ws/Alive"), agent("ws/Other"));

  await client().listAgents("ws");

  expect(store.get(PREF)).toBe("ws/Alive");
});

test("listAgents leaves the synthetic default-agent sentinel alone", async () => {
  store.set(PREF, DEFAULT_AGENT_ID);
  listReturns();

  await client().listAgents("ws");

  expect(store.get(PREF)).toBe(DEFAULT_AGENT_ID);
});

test("deleteAgent clears the pref when the deleted agent was the remembered one", async () => {
  store.set(PREF, "ws/Doomed");

  await client().deleteAgent("ws", "ws/Doomed");

  expect(store.has(PREF)).toBe(false);
});

test("deleteAgent keeps the pref when another agent was deleted", async () => {
  store.set(PREF, "ws/Kept");

  await client().deleteAgent("ws", "ws/Doomed");

  expect(store.get(PREF)).toBe("ws/Kept");
});

test("regression: after boot prunes a stale pref, first-run login runs on the SETUP runtime, not the dead agent's", async () => {
  store.set(PREF, "ws/Deleted Agent");
  listReturns();
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
  await c.listAgents("ws");
  await c.providerLogin("openai");

  expect(setupRuntimeClientFor).toHaveBeenCalled();
  expect(runtimeClientFor).not.toHaveBeenCalled();
  expect(startLogin).toHaveBeenCalledTimes(1);
});

test("provider login targets the FIRST live agent when none is selected but agents exist (never the setup runtime)", async () => {
  listReturns(agent("ws/First"), agent("ws/Second"));
  const startLogin = vi.fn().mockResolvedValue({
    kind: "device_code",
    verificationUri: "https://auth.example/device",
    userCode: "ABCD-1234",
  });
  runtimeClientFor.mockReturnValue({ startLogin });
  setupRuntimeClientFor.mockReturnValue({
    startLogin: vi.fn().mockRejectedValue(new Error("setup pod reached")),
  });

  const c = client();
  await c.listAgents("ws");
  await c.providerLogin("openai");

  expect(runtimeClientFor).toHaveBeenCalledWith(expect.anything(), "ws/First");
  expect(setupRuntimeClientFor).not.toHaveBeenCalled();
  expect(startLogin).toHaveBeenCalledTimes(1);
});

test("provider login falls back to a live agent when the selected pref is stale and agents exist", async () => {
  store.set(PREF, "ws/Deleted Agent");
  listReturns(agent("ws/Alive"));
  const startLogin = vi.fn().mockResolvedValue({
    kind: "device_code",
    verificationUri: "https://auth.example/device",
    userCode: "ABCD-1234",
  });
  runtimeClientFor.mockReturnValue({ startLogin });
  setupRuntimeClientFor.mockReturnValue({
    startLogin: vi.fn().mockRejectedValue(new Error("setup pod reached")),
  });

  const c = client();
  await c.listAgents("ws");
  await c.providerLogin("openai");

  expect(runtimeClientFor).toHaveBeenCalledWith(expect.anything(), "ws/Alive");
  expect(setupRuntimeClientFor).not.toHaveBeenCalled();
});

test("before any agent list resolves, a connect REFUSES instead of trusting the pref", async () => {
  store.set(PREF, "ws/Selected");
  const startLogin = vi.fn();
  runtimeClientFor.mockReturnValue({ startLogin });

  const c = client();
  await expect(c.providerLogin("openai")).rejects.toThrow(/still loading/i);

  expect(startLogin).not.toHaveBeenCalled();
  expect(runtimeClientFor).not.toHaveBeenCalled();
});
