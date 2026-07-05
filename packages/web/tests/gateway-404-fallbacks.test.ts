import { afterEach, expect, test, vi } from "vitest";
import {
  HoustonClient,
  HoustonEngineError,
} from "../src/engine-adapter/client";
import { listInstalledConfigs } from "../src/engine-adapter/control-plane";

/**
 * HOU-688: two desktop calls 404'd against the hosted gateway and red-toasted
 * "not found (engine error 404)".
 *
 * - `version()` rode the runtime-protocol client, whose path is `/version` —
 *   a route only the pi runtime serves. The host's and the gateway's meta
 *   surface is `/v1/version`, so the probe 404'd against EVERY host and the
 *   migration-reconnect signal was permanently "unknown".
 * - `/v1/agent-configs` has no gateway disposition (one pod per agent — no
 *   account-level config library), so the create-agent picker's library read
 *   404'd and toasted. Nothing installed is the honest answer there, exactly
 *   like standalone web.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub fetch with a queue of responses; records every requested url. */
function stubFetch(...responses: Response[]) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };

test("version() asks the host meta surface /v1/version, not the runtime's /version", async () => {
  const calls = stubFetch(
    json(200, { engine: "houston-gateway", protocol: 3, build: null }),
  );
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  const version = (await client.version()) as { engine: string };

  expect(calls).toEqual(["https://gateway.example/v1/version"]);
  expect(version.engine).toBe("houston-gateway");
});

test("version() surfaces a real failure with the host's reason", async () => {
  stubFetch(json(500, { error: "boom" }));
  const client = new HoustonClient({ ...CFG, controlPlane: true });

  await expect(client.version()).rejects.toThrow("boom (engine error 500)");
});

test("a 404 on /v1/agent-configs reads as an empty library — no toast (HOU-688)", async () => {
  stubFetch(json(404, { error: "not found" }));

  await expect(listInstalledConfigs(CFG)).resolves.toEqual([]);
});

test("every other agent-configs failure still propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "library exploded" }));

  await expect(listInstalledConfigs(CFG)).rejects.toThrow(HoustonEngineError);
  stubFetch(json(500, { error: "library exploded" }));
  await expect(listInstalledConfigs(CFG)).rejects.toThrow(
    "library exploded (engine error 500)",
  );
});
