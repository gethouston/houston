import { bus } from "@houston/engine-adapter/bus";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { listProviders, forgetCredential, runtimeLogout } = vi.hoisted(() => ({
  listProviders: vi.fn(),
  forgetCredential: vi.fn(),
  runtimeLogout: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({
      listProviders,
      logout: runtimeLogout,
    })),
  };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import {
  restoreAgentListFetch,
  stubAgentListFetch,
  wireAgent,
} from "./support/agent-list";

const PREF = "houston.pref.last_agent_id";

const STALE_PREF_AGENT = "agent-from-the-other-space";
const THIS_SPACE_AGENT = "agent-in-this-space";

beforeEach(() => {
  vi.useFakeTimers();
  const store = new Map<string, string>([[PREF, STALE_PREF_AGENT]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  listProviders
    .mockReset()
    .mockResolvedValue([{ id: "anthropic", configured: true }]);
  stubAgentListFetch([wireAgent(THIS_SPACE_AGENT)]);
  forgetCredential.mockReset().mockResolvedValue(undefined);
  runtimeLogout.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  restoreAgentListFetch();
  vi.clearAllMocks();
});

function client() {
  const c = new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
  vi.spyOn(
    c.engineSdk.providers.credentials,
    "forgetCredential",
  ).mockImplementation(forgetCredential);
  return c;
}

test("the probe reports UNKNOWN, and makes no request, before the space's agents settle", async () => {
  const statuses = await client().providerStatuses(["anthropic"]);

  expect(statuses.map((s) => s.authState)).toEqual(["unknown"]);
  expect(listProviders).not.toHaveBeenCalled();
});

test("the probe runs once the space's agents have settled", async () => {
  const c = client();
  await c.listAgents("ws");

  const statuses = await c.providerStatuses(["anthropic"]);

  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  expect(listProviders).toHaveBeenCalledTimes(1);
});

test("a provider WRITE refuses before the space's agents settle, rather than guessing", async () => {
  const events: unknown[] = [];
  const unsubscribe = bus.on((event) => events.push(event));

  await expect(client().providerLogout("anthropic")).rejects.toThrow(
    /still loading/i,
  );
  unsubscribe();
  expect(forgetCredential).not.toHaveBeenCalled();
  expect(events).toEqual([]);

  await expect(
    client().setProviderApiKey("opencode", "sk-test"),
  ).rejects.toThrow(/still loading/i);

  await expect(client().providerLogin("anthropic")).rejects.toThrow(
    /still loading/i,
  );
});

test("a settled write targets the SPACE's agent, never the stale pref", async () => {
  const c = client();
  await c.listAgents("ws");

  await c.providerLogout("anthropic");

  expect(localStorage.getItem(PREF)).toBeNull();
  for (const call of forgetCredential.mock.calls) {
    expect(call[0]).toBe(THIS_SPACE_AGENT);
  }
  expect(forgetCredential).toHaveBeenCalled();
});

const ORG_A = "00000000000000aa";
const ORG_B = "00000000000000bb";
const AGENT_IN_A = "agent-in-space-a";
const AGENT_IN_B = "agent-in-space-b";

test("switching spaces un-settles routing until the NEW space's list lands", async () => {
  const c = client();

  c.setActiveOrg(ORG_A);
  stubAgentListFetch([wireAgent(AGENT_IN_A)]);
  await c.listAgents("ws");
  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );

  c.setActiveOrg(ORG_B);
  listProviders.mockClear();

  const midSwitch = await c.providerStatuses(["anthropic"]);
  expect(midSwitch.map((s) => s.authState)).toEqual(["unknown"]);
  expect(listProviders).not.toHaveBeenCalled();

  forgetCredential.mockClear();
  await expect(c.providerLogout("anthropic")).rejects.toThrow(/still loading/i);
  expect(forgetCredential).not.toHaveBeenCalled();

  stubAgentListFetch([wireAgent(AGENT_IN_B)]);
  await c.listAgents("ws");
  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );
  await c.providerLogout("anthropic");
  for (const call of forgetCredential.mock.calls) {
    expect(call[0]).toBe(AGENT_IN_B);
  }
});

test("re-pinning the SAME space does not un-settle a loaded list", async () => {
  const c = client();
  c.setActiveOrg(ORG_A);
  await c.listAgents("ws");

  c.setActiveOrg(ORG_A);

  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );
});

test("a FAILED agent list degrades to pref-based routing instead of bricking", async () => {
  const c = client();
  stubAgentListFetch({ status: 500, error: "gateway blew up" });

  await expect(c.listAgents("ws")).rejects.toThrow(/gateway blew up/);

  const statuses = await c.providerStatuses(["anthropic"]);
  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  expect(listProviders).toHaveBeenCalledTimes(1);

  await c.providerLogout("anthropic");
  expect(forgetCredential).toHaveBeenCalled();
  for (const call of forgetCredential.mock.calls) {
    expect(call[0]).toBe(STALE_PREF_AGENT);
  }
});

test("a later SUCCESSFUL list restores strict validation after a failure", async () => {
  const c = client();
  stubAgentListFetch({ status: 500, error: "blip" }, []);
  await expect(c.listAgents("ws")).rejects.toThrow(/blip/);

  await c.listAgents("ws");

  forgetCredential.mockClear();
  await c.providerLogout("anthropic");
  expect(localStorage.getItem(PREF)).toBeNull();
  for (const call of forgetCredential.mock.calls) {
    expect(call[0]).toBe(THIS_SPACE_AGENT);
  }
});

test("a failure never downgrades a list we already have", async () => {
  const c = client();
  await c.listAgents("ws");
  stubAgentListFetch({ status: 500, error: "blip" }, []);
  await expect(c.listAgents("ws")).rejects.toThrow(/blip/);

  forgetCredential.mockClear();
  await c.providerLogout("anthropic");
  for (const call of forgetCredential.mock.calls) {
    expect(call[0]).toBe(THIS_SPACE_AGENT);
  }
});

test("noteAgentsUnavailable settles routing when no list will ever be asked for", async () => {
  const c = client();

  c.noteAgentsUnavailable();

  const statuses = await c.providerStatuses(["anthropic"]);
  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  await c.providerLogout("anthropic");
  expect(forgetCredential).toHaveBeenCalled();
});
