import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * Migration wave 2a — byte-identical route parity for the web-adapter WRITE
 * delegated to `@houston/sdk`: account-preference set. The delegated path MUST
 * issue the exact request the old `controlPlane.*` helper did — same method,
 * path, body, and headers (`Content-Type`, `Authorization` bearer, and the live
 * `x-houston-org`) — over the ONE shared gateway fetch, with NO post-write
 * refetch (the property that keeps it out of the SDK-facade refetch that blocks
 * agents/activities).
 *
 * Reproduce-first: `account-preferences.test.ts` already pins the pref-write
 * WIRE (exact PUT, single call) and stays green through this delegation; these
 * tests additionally lock the request HEADERS.
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function stubFetch(...responses: Response[]) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = (controlPlane: boolean) =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane });

// ---- preferences.set delegation ----

test("setPreference delegates a byte-identical single PUT (path+body+headers)", async () => {
  // The host echoes `{value}` on PUT; the SDK reads it (and this caller
  // discards it) — still ONE request, so no refetch.
  stubFetch(json(200, { value: "America/Bogota" }));

  await client(true).setPreference("timezone", "America/Bogota");

  expect(calls).toHaveLength(1); // no post-write refetch
  const [put] = calls;
  expect(put.method).toBe("PUT");
  expect(put.url).toBe(`${BASE}/v1/preferences/timezone`);
  expect(put.body).toBe(JSON.stringify({ value: "America/Bogota" }));
  expect(put.headers.get("Content-Type")).toBe("application/json");
  expect(put.headers.get("Authorization")).toBe("Bearer t");
});

test("setPreference carries the live x-houston-org for the active team space", async () => {
  stubFetch(json(200, { value: "es" }));
  const c = client(true);
  c.setActiveOrg(ORG);

  await c.setPreference("locale", "es");

  expect(calls).toHaveLength(1);
  expect(calls[0].headers.get("x-houston-org")).toBe(ORG);
});

test("a failed preference write propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "boom" }));

  await expect(
    client(true).setPreference("timezone", "America/Bogota"),
  ).rejects.toThrow();
});
