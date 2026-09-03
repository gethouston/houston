import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isNoAgentForProviderWriteError } from "../src/engine-adapter/no-agent-provider-write-error";

/**
 * PRODUCT-1662 — provider writes in a space whose agent list is settled and
 * EMPTY (first-run before the assistant exists, a failed first create, a
 * deleted last agent).
 *
 * `requireProviderAgentId` used to refuse every zero-agent write with "Open an
 * agent first", the copy written for the STILL-LOADING state — a dead end for
 * users that also filed as an unexpected error. The rules now:
 *   1. sign-out routes through the hidden SETUP runtime (the mirror of how the
 *      credential was connected): forget the central credential, clear the
 *      setup runtime's own auth copy, and never touch a per-agent route;
 *   2. a custom endpoint has no pre-agent home (it is per-runtime state and
 *      the setup runtime dies with the first agent), so it refuses with the
 *      TYPED expected-state error the app turns into "create an agent first";
 *   3. the "still loading" refusal stays exactly what it was for `pending`.
 */

const {
  cpListAgents,
  forgetCredential,
  forgetSetupCredential,
  setCustomEndpoint,
  runtimeLogout,
  setupLogout,
  agentClaim,
} = vi.hoisted(() => ({
  cpListAgents: vi.fn(),
  forgetCredential: vi.fn(),
  forgetSetupCredential: vi.fn(),
  setCustomEndpoint: vi.fn(),
  runtimeLogout: vi.fn(),
  setupLogout: vi.fn(),
  agentClaim: vi.fn(),
}));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    listAgents: cpListAgents,
    forgetCredential,
    forgetSetupCredential,
    setCustomEndpoint,
    runtimeClientFor: vi.fn(() => ({
      logout: runtimeLogout,
      claimActiveProvider: agentClaim,
    })),
    setupRuntimeClientFor: vi.fn(() => ({ logout: setupLogout })),
  };
});

import { HoustonClient } from "../src/engine-adapter/client";

const PREF = "houston.pref.last_agent_id";
/** A selection left over from before the last agent was deleted. */
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
  // The space's list is KNOWN and EMPTY.
  cpListAgents.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function zeroAgentClient() {
  const c = new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
  await c.listAgents("ws");
  return c;
}

test("sign-out with no agent routes through the setup runtime, never a per-agent route", async () => {
  const c = await zeroAgentClient();

  await c.providerLogout("anthropic");

  expect(forgetSetupCredential).toHaveBeenCalledTimes(1);
  expect(forgetSetupCredential.mock.calls[0]?.[1]).toBe("anthropic");
  expect(setupLogout).toHaveBeenCalledWith("anthropic");
  // The stale pref must not turn into `/agents/<dead>/credential/forget`.
  expect(forgetCredential).not.toHaveBeenCalled();
  expect(runtimeLogout).not.toHaveBeenCalled();
});

test("sign-out with no agent clears every sibling gateway, like the per-agent path", async () => {
  const c = await zeroAgentClient();

  await c.providerLogout("opencode");

  const forgotten = forgetSetupCredential.mock.calls.map((call) => call[1]);
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
  cpListAgents.mockResolvedValue([{ id: "agent-1" }]);
  const c = await zeroAgentClient();

  await c.providerLogout("anthropic");
  expect(forgetCredential.mock.calls[0]?.[1]).toBe("agent-1");
  expect(forgetSetupCredential).not.toHaveBeenCalled();

  await c.setProviderCustomEndpoint({
    baseUrl: "https://tunnel.example/v1",
    model: "local",
  });
  expect(setCustomEndpoint.mock.calls[0]?.[1]).toBe("agent-1");
});
