import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The account-preference WRITE delegated to `@houston/sdk`. It MUST issue
 * exactly the request recorded here — same method, path, body, and headers
 * (`Content-Type`, `Authorization` bearer, and the live `x-houston-org`) — over
 * the ONE shared gateway fetch, with NO post-write refetch (the property that
 * keeps it out of the SDK-facade refetch that blocks agents/activities).
 *
 * `account-preferences.test.ts` pins the pref-write WIRE (exact PUT, single
 * call); what these tests add is the request HEADERS.
 */

const BASE = "http://host";

const { calls, reset, restore, stubResponses: stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

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

test("clearing an account preference PUTs a null value", async () => {
  // `null` is a real value on the wire, not "skip the write": the host stores
  // it, which is how a preference is unset.
  stubFetch(json(200, { value: null }));

  await client(true).setPreference("locale", null);

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("PUT");
  expect(calls[0].url).toBe(`${BASE}/v1/preferences/locale`);
  expect(calls[0].body).toBe(JSON.stringify({ value: null }));
});

test("clearing a DEVICE preference removes the entry, never stores 'null'", async () => {
  const c = client(true);
  await c.setPreference("theme", "dark");
  expect(await c.getPreference("theme")).toBe("dark");

  await c.setPreference("theme", null);

  expect(await c.getPreference("theme")).toBeNull();
  expect(calls).toHaveLength(0); // device keys never reach the gateway
});

test("a failed preference write propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "boom" }));

  await expect(
    client(true).setPreference("timezone", "America/Bogota"),
  ).rejects.toThrow();
});
