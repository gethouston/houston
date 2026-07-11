import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * HOU-732: account-level preferences must reach the ENGINE, not this browser's
 * localStorage. The adapter used to keep every preference device-local, so the
 * host scheduler never learned the user's timezone — hosted agents fired
 * routines in the pod's zone (UTC) while the UI rendered the browser's, an
 * hours-off "next run". These tests pin the split: account keys ride
 * `/v1/preferences/:key` (gateway AND local host serve it), device keys stay
 * in localStorage, and a pre-fix local copy is migrated up once.
 */

const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let calls: { url: string; method: string; body: string | null }[];

beforeEach(() => {
  store = new Map();
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
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
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
  new HoustonClient({ baseUrl: "http://host", token: "t", controlPlane });

test("timezone reads come from the engine, not localStorage", async () => {
  store.set("houston.pref.timezone", "America/New_York"); // stale device copy
  stubFetch(json(200, { value: "America/Bogota" }));

  const value = await client(true).getPreference("timezone");

  expect(value).toBe("America/Bogota");
  expect(calls).toEqual([
    { url: "http://host/v1/preferences/timezone", method: "GET", body: null },
  ]);
});

test("timezone writes reach the engine and drop the device copy", async () => {
  store.set("houston.pref.timezone", "America/New_York");
  stubFetch(json(200, { value: "America/Bogota" }));

  await client(true).setPreference("timezone", "America/Bogota");

  expect(calls).toEqual([
    {
      url: "http://host/v1/preferences/timezone",
      method: "PUT",
      body: JSON.stringify({ value: "America/Bogota" }),
    },
  ]);
  expect(store.has("houston.pref.timezone")).toBe(false);
});

test("a pre-fix device-local value is migrated up once, then dropped", async () => {
  store.set("houston.pref.timezone", "America/Bogota");
  stubFetch(json(200, { value: null }), json(200, { value: "America/Bogota" }));

  const value = await client(true).getPreference("timezone");

  expect(value).toBe("America/Bogota");
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
    "GET http://host/v1/preferences/timezone",
    "PUT http://host/v1/preferences/timezone",
  ]);
  expect(store.has("houston.pref.timezone")).toBe(false);
});

test("unset everywhere reads as null (the caller then auto-seeds)", async () => {
  stubFetch(json(200, { value: null }));

  await expect(client(true).getPreference("timezone")).resolves.toBeNull();
  expect(calls).toHaveLength(1);
});

test("account keys ride the engine route in LOCAL mode too — the local host scheduler reads the same doc", async () => {
  stubFetch(json(200, { value: "America/Bogota" }));

  const value = await client(false).getPreference("timezone");

  expect(value).toBe("America/Bogota");
  expect(calls[0]?.url).toBe("http://host/v1/preferences/timezone");
});

test("an engine failure propagates — never a silent localStorage fallback", async () => {
  store.set("houston.pref.timezone", "America/Bogota");
  stubFetch(json(500, { error: "boom" }));

  await expect(client(true).getPreference("timezone")).rejects.toThrow("boom");
});

test("device keys never touch the network", async () => {
  stubFetch(); // any fetch would throw "no responses left"
  const c = client(true);

  await c.setPreference("theme", "dark");
  await expect(c.getPreference("theme")).resolves.toBe("dark");
  await expect(c.getPreference("last_agent_id")).resolves.not.toBeNull();

  expect(calls).toEqual([]);
});

test("locale, legal_acceptance and the migration flag are account keys", async () => {
  stubFetch(
    json(200, { value: "es" }),
    json(200, { value: '{"version":1}' }),
    json(200, { value: "1" }),
  );
  const c = client(true);

  await expect(c.getPreference("locale")).resolves.toBe("es");
  await expect(c.getPreference("legal_acceptance")).resolves.toBe(
    '{"version":1}',
  );
  await expect(c.getPreference("migration_reconnect_dismissed")).resolves.toBe(
    "1",
  );
  expect(calls.map((c) => c.url)).toEqual([
    "http://host/v1/preferences/locale",
    "http://host/v1/preferences/legal_acceptance",
    "http://host/v1/preferences/migration_reconnect_dismissed",
  ]);
});
