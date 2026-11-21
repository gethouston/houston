import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { HANDOFF_RETRY_DELAYS_MS } from "@houston/engine-adapter/cp/unavailable-reason";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

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
      officePreview: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(CAPS_URL);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a 503 arrives as a HoustonEngineError carrying the host's reason", async () => {
    vi.useFakeTimers();
    stubFetch(() => json(503, { error: "capabilities are rolling" }));

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

    const c = client();
    await expect(c.listInstalledConfigs()).resolves.toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      CAPS_URL,
      `${BASE}/v1/agent-configs`,
    ]);

    reset();
    await c.listInstalledConfigs();
    expect(calls[0].url).toBe(CAPS_URL);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
