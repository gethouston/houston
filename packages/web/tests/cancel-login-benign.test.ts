import { afterEach, beforeEach, expect, test, vi } from "vitest";

const cancelLogin = vi.fn();

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({ cancelLogin })),
  };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import { EngineError } from "@houston/runtime-client";

beforeEach(() => {
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
