import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createWireCapture, json, ORG } from "./support/wire-capture";

const { calls, reset, restore, stubFetch } = createWireCapture();
const DEVICE = "123e4567-e89b-42d3-a456-426614174000";
const BASE = "https://gw.example";
function client() {
  const value = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  value.setActiveOrg(ORG);
  return value;
}
beforeEach(() => {
  reset();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

function expectCall(method: string, path: string, body: string | null) {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  expect(call.method).toBe(method);
  expect(call.url).toBe(`${BASE}${path}`);
  expect(call.body).toBe(body);
  expect([...call.headers.entries()]).toEqual([
    ["authorization", "Bearer t"],
    ["content-type", "application/json"],
    ["x-houston-org", ORG],
  ]);
}

test("register device uses exact C23 request", async () => {
  stubFetch(() => json(200, { device_id: DEVICE }));
  const input = {
    token: "fcm-token",
    platform: "ios" as const,
    locale: "es-CO",
    app_version: "0.5.41",
  };
  expect(await client().registerPushDevice(DEVICE, input)).toEqual({
    device_id: DEVICE,
  });
  expectCall("PUT", `/v1/me/push/devices/${DEVICE}`, JSON.stringify(input));
});

test("device conflict retries once with a newly persisted id", async () => {
  const input = {
    token: "fcm-token",
    platform: "ios" as const,
    locale: "en",
    app_version: "1",
  };
  stubRoutedConflict();
  const value = client();
  const result = await value.registerPushDevice(DEVICE, input);
  expect(calls).toHaveLength(2);
  expect(calls[0]?.url).toBe(`${BASE}/v1/me/push/devices/${DEVICE}`);
  expect(calls[1]?.url).toBe(`${BASE}/v1/me/push/devices/${result.device_id}`);
  expect(result.device_id).not.toBe(DEVICE);
  expect(localStorage.getItem("houston.pref.push.device_id")).toBe(
    result.device_id,
  );
  for (const call of calls) {
    expect(call.method).toBe("PUT");
    expect(call.body).toBe(JSON.stringify(input));
    expect([...call.headers.entries()]).toEqual([
      ["authorization", "Bearer t"],
      ["content-type", "application/json"],
      ["x-houston-org", ORG],
    ]);
  }
});

function stubRoutedConflict() {
  let first = true;
  stubFetch(() => {
    if (first) {
      first = false;
      return json(409, { code: "device_conflict" });
    }
    return json(200, { device_id: calls.at(-1)?.url.split("/").at(-1) });
  });
}

test("unregister device uses exact C23 request", async () => {
  stubFetch(() => new Response(null, { status: 204 }));
  await client().unregisterPushDevice(DEVICE);
  expectCall("DELETE", `/v1/me/push/devices/${DEVICE}`, null);
});

test("presence uses the saved device id", async () => {
  localStorage.setItem("houston.pref.push.device_id", DEVICE);
  stubFetch(() => new Response(null, { status: 204 }));
  await client().reportPushPresence(true);
  expectCall(
    "PUT",
    "/v1/me/push/presence",
    JSON.stringify({ client_id: DEVICE, foreground: true }),
  );
  localStorage.removeItem("houston.pref.push.device_id");
});
