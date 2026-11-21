import {
  HoustonClient,
  HoustonEngineError,
} from "@houston/engine-adapter/client";
import { afterEach, expect, test, vi } from "vitest";

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
