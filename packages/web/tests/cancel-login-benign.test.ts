import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-676: the reconnect card's every press goes cancelLogin → launchLogin
 * (the engine keeps one login slot per provider, so a relaunch must free it
 * first). The card's contract says cancel is IDEMPOTENT — but with nothing
 * pending the runtime/host can answer 404, and a propagated 404 aborts the
 * chain: the card flips to "failed" and the login never launches. A 404 on
 * cancel means the slot is already free — cancel's postcondition holds — so
 * the adapter treats it as benign. Every other failure still propagates.
 */

const cancelLogin = vi.fn();

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({ cancelLogin })),
  };
});

import { EngineError } from "@houston/runtime-client";
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
  cancelLogin.mockReset();
});

afterEach(() => vi.clearAllMocks());

function client() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

test("a 404 on cancel (nothing pending) is benign — the card's cancel → launch chain survives", async () => {
  cancelLogin.mockRejectedValue(new EngineError(404, '{"error":"not found"}'));

  await expect(client().cancelProviderLogin("openai")).resolves.toBeUndefined();
  expect(cancelLogin).toHaveBeenCalledTimes(1);
});

test("a real cancel failure still propagates — never swallowed", async () => {
  cancelLogin.mockRejectedValue(new EngineError(500, "runtime exploded"));

  await expect(client().cancelProviderLogin("openai")).rejects.toThrow(
    "engine request failed (500)",
  );
});
