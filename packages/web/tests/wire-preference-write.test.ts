import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

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

test("setPreference delegates a byte-identical single PUT (path+body+headers)", async () => {
  stubFetch(json(200, { value: "America/Bogota" }));

  await client(true).setPreference("timezone", "America/Bogota");

  expect(calls).toHaveLength(1);
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
  expect(calls).toHaveLength(0);
});

test("a failed preference write propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "boom" }));

  await expect(
    client(true).setPreference("timezone", "America/Bogota"),
  ).rejects.toThrow();
});
