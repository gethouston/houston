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
