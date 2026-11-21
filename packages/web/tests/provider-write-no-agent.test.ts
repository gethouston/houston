import { bus } from "@houston/engine-adapter/bus";
import { isNoAgentForProviderWriteError } from "@houston/engine-adapter/no-agent-provider-write-error";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const {
  forgetCredential,
  forgetSetupCredential,
  setCustomEndpoint,
  runtimeLogout,
  setupLogout,
  agentClaim,
} = vi.hoisted(() => ({
  forgetCredential: vi.fn(),
  forgetSetupCredential: vi.fn(),
  setCustomEndpoint: vi.fn(),
  runtimeLogout: vi.fn(),
  setupLogout: vi.fn(),
  agentClaim: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({
      logout: runtimeLogout,
      claimActiveProvider: agentClaim,
    })),
    setupRuntimeClientFor: vi.fn(() => ({ logout: setupLogout })),
  };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import {
  restoreAgentListFetch,
  stubAgentListFetch,
  wireAgent,
} from "./support/agent-list";

const PREF = "houston.pref.last_agent_id";
const STALE_PREF_AGENT = "agent-that-no-longer-exists";

beforeEach(() => {
  const store = new Map<string, string>([[PREF, STALE_PREF_AGENT]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  for (const fn of [
    forgetCredential,
    forgetSetupCredential,
    setCustomEndpoint,
    runtimeLogout,
    setupLogout,
    agentClaim,
  ]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  stubAgentListFetch([]);
});

afterEach(() => {
  restoreAgentListFetch();
  vi.clearAllMocks();
});

async function zeroAgentClient() {
  const c = new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
  const credentials = c.engineSdk.providers.credentials;
  vi.spyOn(credentials, "forgetCredential").mockImplementation(
    forgetCredential,
  );
  vi.spyOn(credentials, "forgetSetupCredential").mockImplementation(
    forgetSetupCredential,
  );
  vi.spyOn(credentials, "setCustomEndpoint").mockImplementation(
    setCustomEndpoint,
  );
  await c.listAgents("ws");
  return c;
}

test("sign-out with no agent routes through the setup runtime, never a per-agent route", async () => {
  const c = await zeroAgentClient();
  const events: unknown[] = [];
  const unsubscribe = bus.on((event) => events.push(event));

  await c.providerLogout("anthropic");
  unsubscribe();

  expect(events).toContainEqual({
    type: "ProviderLoginComplete",
    data: { provider: "anthropic", success: false, error: null },
  });
  expect(forgetSetupCredential).toHaveBeenCalledTimes(1);
  expect(forgetSetupCredential.mock.calls[0]?.[0]).toBe("anthropic");
  expect(setupLogout).toHaveBeenCalledWith("anthropic");
  expect(forgetCredential).not.toHaveBeenCalled();
  expect(runtimeLogout).not.toHaveBeenCalled();
});

test("sign-out with no agent clears every sibling gateway, like the per-agent path", async () => {
  const c = await zeroAgentClient();

  await c.providerLogout("opencode");

  const forgotten = forgetSetupCredential.mock.calls.map((call) => call[0]);
  expect(forgotten).toEqual(
    expect.arrayContaining(["opencode", "opencode-go"]),
  );
  expect(setupLogout).toHaveBeenCalledTimes(forgotten.length);
});

test("a custom endpoint with no agent refuses with the typed expected-state error", async () => {
  const c = await zeroAgentClient();

  const attempt = c.setProviderCustomEndpoint({
    baseUrl: "https://tunnel.example/v1",
    model: "local",
  });

  await expect(attempt).rejects.toSatisfy(isNoAgentForProviderWriteError);
  expect(setCustomEndpoint).not.toHaveBeenCalled();
  expect(agentClaim).not.toHaveBeenCalled();
});

test("the still-loading refusal is unchanged and is NOT the expected-state error", async () => {
  const c = new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });

  await expect(c.providerLogout("anthropic")).rejects.toThrow(/still loading/i);
  const endpoint = c.setProviderCustomEndpoint({
    baseUrl: "https://tunnel.example/v1",
    model: "local",
  });
  await expect(endpoint).rejects.toThrow(/still loading/i);
  await expect(endpoint).rejects.not.toSatisfy(isNoAgentForProviderWriteError);
  expect(forgetSetupCredential).not.toHaveBeenCalled();
});

test("with an agent, sign-out and the endpoint still take the per-agent routes", async () => {
  stubAgentListFetch([wireAgent("agent-1")]);
  const c = await zeroAgentClient();

  await c.providerLogout("anthropic");
  expect(forgetCredential.mock.calls[0]?.[0]).toBe("agent-1");
  expect(forgetSetupCredential).not.toHaveBeenCalled();

  await c.setProviderCustomEndpoint({
    baseUrl: "https://tunnel.example/v1",
    model: "local",
  });
  expect(setCustomEndpoint.mock.calls[0]?.[0]).toBe("agent-1");
});
