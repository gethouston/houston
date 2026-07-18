import { beforeEach, expect, test, vi } from "vitest";

/**
 * The guided "connect a local model" flow branches on whether the deployment
 * offers a tunnel relay. `getTunnelCredentials()` resolves `null` for every
 * "this deployment has no relay" answer — no gateway at all, tunnels route
 * absent (404), or relay explicitly unconfigured (503 "tunnel relay not
 * configured", the gateway's answer) — telling the flow to register the
 * detected server DIRECTLY. Real failures (auth, outage) still throw: a relay
 * that exists but errored must surface, never silently downgrade to a direct
 * localhost endpoint against a real cloud pod.
 */

const { mintTunnelCredentials } = vi.hoisted(() => ({
  mintTunnelCredentials: vi.fn(),
}));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return { ...actual, getTunnelCredentials: mintTunnelCredentials };
});

import {
  HoustonClient,
  HoustonEngineError,
} from "../src/engine-adapter/client";

// Braces matter: `() => mock.mockClear()` RETURNS the mock function, which
// vitest runs as an after-test teardown hook — invoking the mock once more and
// leaving its rejected promise unhandled, failing every rejection test here.
beforeEach(() => {
  mintTunnelCredentials.mockClear();
});

function cpClient() {
  return new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
}

test("resolves the minted credentials when the relay answers", async () => {
  const cred = {
    subdomain: "sub",
    publicUrl: "https://sub.tunnels.example.com",
    relayHost: "relay.example.com",
    relayPort: 7000,
    token: "tok",
    transport: "wss",
  };
  mintTunnelCredentials.mockResolvedValue(cred);

  await expect(cpClient().getTunnelCredentials()).resolves.toEqual(cred);
});

test("resolves null with no control plane (local engine, no gateway)", async () => {
  const local = new HoustonClient({ baseUrl: "http://host", token: "t" });

  await expect(local.getTunnelCredentials()).resolves.toBeNull();
  expect(mintTunnelCredentials).not.toHaveBeenCalled();
});

test("resolves null when the gateway has no relay configured (503)", async () => {
  mintTunnelCredentials.mockRejectedValue(
    new HoustonEngineError(503, { error: "tunnel relay not configured" }),
  );

  await expect(cpClient().getTunnelCredentials()).resolves.toBeNull();
});

test("resolves null when the gateway has no tunnels route (404)", async () => {
  mintTunnelCredentials.mockRejectedValue(
    new HoustonEngineError(404, { error: "not found" }),
  );

  await expect(cpClient().getTunnelCredentials()).resolves.toBeNull();
});

test("a transient 503 that is NOT the unconfigured answer still throws", async () => {
  mintTunnelCredentials.mockRejectedValue(
    new HoustonEngineError(503, { error: "upstream timeout" }),
  );

  await expect(cpClient().getTunnelCredentials()).rejects.toThrow(
    "upstream timeout",
  );
});

test("real failures (auth, server error) still throw", async () => {
  mintTunnelCredentials.mockRejectedValue(
    new HoustonEngineError(500, { error: "boom" }),
  );

  await expect(cpClient().getTunnelCredentials()).rejects.toThrow("boom");
});
