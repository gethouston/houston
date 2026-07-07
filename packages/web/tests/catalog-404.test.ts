import { afterEach, expect, test, vi } from "vitest";
import {
  HoustonClient,
  HoustonEngineError,
} from "../src/engine-adapter/client";

/**
 * `getCatalog()` must NOT silently degrade a 404 to `[]`. That degrade is what
 * shipped the packaged app with providers but ZERO models: a host that predates
 * the `GET /v1/catalog` route 404s, and swallowing it left the picker on the
 * empty seed with no signal. Every current host AND the e2e/standalone fake host
 * serve the route, so a 404 is a real failure that must throw like any other
 * route — the caller keeps the seed for the UI but surfaces the error loudly.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub fetch with a single response and record the requested url. */
function stubFetch(response: Response): string[] {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    return response;
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://host.example", token: "t" };

test("getCatalog() hits /v1/catalog on the host meta surface", async () => {
  const calls = stubFetch(json(200, [{ id: "anthropic", models: [] }]));
  const client = new HoustonClient({ ...CFG });

  await client.getCatalog();

  expect(calls).toEqual(["https://host.example/v1/catalog"]);
});

test("getCatalog() throws HoustonEngineError on a 404 (no silent [] degrade)", async () => {
  stubFetch(json(404, { error: "no route" }));
  const client = new HoustonClient({ ...CFG });

  await expect(client.getCatalog()).rejects.toThrow(HoustonEngineError);
  stubFetch(json(404, { error: "no route" }));
  await expect(client.getCatalog()).rejects.toThrow(
    "no route (engine error 404)",
  );
});

test("getCatalog() throws HoustonEngineError on a 500", async () => {
  stubFetch(json(500, { error: "boom" }));
  const client = new HoustonClient({ ...CFG });

  await expect(client.getCatalog()).rejects.toThrow("boom (engine error 500)");
});

test("getCatalog() returns a 200 catalog verbatim (an empty array is valid, not an error)", async () => {
  stubFetch(json(200, []));
  const client = new HoustonClient({ ...CFG });

  await expect(client.getCatalog()).resolves.toEqual([]);
});
