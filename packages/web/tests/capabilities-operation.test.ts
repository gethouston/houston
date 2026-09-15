import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import { HANDOFF_RETRY_DELAYS_MS } from "../src/engine-adapter/cp/unavailable-reason";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * `getCapabilities` — the deployment describing itself, and the one operation
 * the assistant catalog publishes out of `boot-mixin.ts`.
 *
 * It moved off the hand-rolled `gatewayAuthFetch` block onto `cpFetch`, which
 * is what makes the generator see a route at all. So what is pinned here is
 * that the move changed nothing a caller can observe — the same single GET with
 * the same auth and active-space headers, the same `HoustonEngineError` on a
 * non-2xx — plus the degrade `deploymentServes` builds on top of it, which is
 * the only caller that must survive the probe failing.
 */

const BASE = "http://host";
const CAPS_URL = `${BASE}/v1/capabilities`;

const { calls, reset, restore, stubFetch, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** A hosted client with an active space pinned, as the app runs in cloud. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

describe("the published capabilities read", () => {
  test("issues exactly one GET /v1/capabilities, with the gateway headers", async () => {
    stubFetch(() => json(200, { profile: "cloud" }));

    await expect(client().capabilities()).resolves.toEqual({
      profile: "cloud",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(CAPS_URL);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a 503 arrives as a HoustonEngineError carrying the host's reason", async () => {
    // `cpFetch`'s throw replaces the hand-rolled `!res.ok` block, and brings
    // its read ladder with it: an unrecognised 5xx body is the `handoff`
    // reason, two blind retries. Fake timers because the COUNT is the point,
    // not four seconds of real sleeping.
    vi.useFakeTimers();
    stubFetch(() => json(503, { error: "capabilities are rolling" }));

    // The handler is attached BEFORE the timers run: a ladder that settles
    // with nobody listening surfaces as an unhandled rejection.
    const started = Date.now();
    const failed = client()
      .capabilities()
      .catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await failed;

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(503);
    expect(err.message).toBe("capabilities are rolling (engine error 503)");
    expect(calls).toHaveLength(HANDOFF_RETRY_DELAYS_MS.length + 1);
    // And the BUDGET, not just the count: this read blocks a boot, so the
    // ladder must be bounded by the handoff schedule rather than by whatever
    // a future reason classifier decides this body earns.
    expect(Date.now() - started).toBe(
      HANDOFF_RETRY_DELAYS_MS.reduce((total, ms) => total + ms, 0),
    );
  });
});

describe("the deployment probe built on it", () => {
  test("a failed probe still serves, and is not remembered as a verdict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubRouted((call) =>
      call.url === CAPS_URL ? json(500, { error: "boom" }) : json(200, []),
    );

    // An unknown deployment is not a refusal: the library read goes ahead.
    const c = client();
    await expect(c.listInstalledConfigs()).resolves.toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      CAPS_URL,
      `${BASE}/v1/agent-configs`,
    ]);

    // Forgotten, not pinned for the session: the SAME client probes again.
    reset();
    await c.listInstalledConfigs();
    expect(calls[0].url).toBe(CAPS_URL);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
