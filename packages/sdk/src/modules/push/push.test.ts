import { expect, test, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const input = {
  token: "fcm",
  platform: "ios" as const,
  locale: "en",
  app_version: "1",
};

test("device id survives SDK reconstruction and registration skips unchanged input for 24 hours", async () => {
  const prefs = memoryKv();
  let now = 0;
  const fetchMock = vi.fn(
    async (request: RequestInfo | URL) =>
      new Response(
        JSON.stringify({ device_id: String(request).split("/").at(-1) }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
  );
  const ports: SdkPorts = {
    fetch: fetchMock as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: prefs,
    clock: { now: () => now, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    userId: () => "alice",
  };
  const create = () =>
    new HoustonSdk({ baseUrl: "https://gw.example", ports, reactivity: false });
  const first = create();
  const id = await first.push.deviceId();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await create().push.deviceId()).toBe(id);
  expect(
    await Promise.all([
      first.push.registerDevice(id, input),
      first.push.registerDevice(id, input),
    ]),
  ).toEqual([{ device_id: id }, { device_id: id }]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await first.push.registerDevice(id, input)).toEqual({ device_id: id });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await first.push.registerDevice(id, { ...input, locale: "es" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  now = 24 * 60 * 60 * 1000;
  await first.push.registerDevice(id, { ...input, locale: "es" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("registration cache follows the signed-in user", async () => {
  let user = "alice";
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ device_id: "device" })),
    );
  const sdk = new HoustonSdk({
    baseUrl: "https://gw.example",
    reactivity: false,
    ports: {
      fetch: fetchMock as typeof fetch,
      storage: memoryKv(),
      devicePreferences: memoryKv(),
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      userId: () => user,
    },
  });
  await sdk.push.registerDevice("device", input);
  user = "bob";
  await sdk.push.registerDevice("device", input);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("device_conflict mints, saves and retries one new device id", async () => {
  const prefs = memoryKv();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"code":"device_conflict"}', { status: 409 }),
    )
    .mockImplementation(
      async (url: RequestInfo | URL) =>
        new Response(
          JSON.stringify({ device_id: String(url).split("/").at(-1) }),
        ),
    );
  const sdk = new HoustonSdk({
    baseUrl: "https://gw.example",
    reactivity: false,
    ports: {
      fetch: fetchMock as typeof fetch,
      storage: memoryKv(),
      devicePreferences: prefs,
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      userId: () => "alice",
    },
  });
  const result = await sdk.push.registerDevice("old-id", input);
  expect(result.device_id).not.toBe("old-id");
  expect(await prefs.get("push.device_id")).toBe(result.device_id);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
