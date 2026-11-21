import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyHostModeGlobals,
  type HostModeGlobals,
} from "../src/boot-globals";

const HOST = "https://selfhost.example";

let calls: string[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ items: [{ id: "r1", name: "Daily digest" }] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: HostModeGlobals }).window;
  vi.restoreAllMocks();
});

function bootWindow(engine: { baseUrl: string; token: string } | null) {
  const win: HostModeGlobals = {};
  applyHostModeGlobals(win, engine);
  (globalThis as { window?: HostModeGlobals }).window = win;
  return win;
}

test("self-host boot with a stored config publishes host mode and the endpoint", () => {
  const win = bootWindow({ baseUrl: HOST, token: "tok" });
  expect(win.__HOUSTON_CP__).toBe(true);
  expect(win.__HOUSTON_ENGINE__).toEqual({ baseUrl: HOST, token: "tok" });
});

test("self-host boot with no config yet still publishes host mode", () => {
  const win = bootWindow(null);
  expect(win.__HOUSTON_CP__).toBe(true);
  expect(win.__HOUSTON_ENGINE__).toBeUndefined();
});

test("a client built on those globals routes routines, not a silent empty list", async () => {
  bootWindow({ baseUrl: HOST, token: "tok" });
  const client = new HoustonClient({ baseUrl: HOST, token: "tok" });
  const routines = await client.listRoutines("Houston/Assistant");
  expect(calls).toEqual([`${HOST}/agents/Houston%2FAssistant/routines`]);
  expect(routines).toEqual([{ id: "r1", name: "Daily digest" }]);
});

test("without the flag the same call silently answers [] — the bug being pinned", async () => {
  (globalThis as { window?: HostModeGlobals }).window = {};
  const client = new HoustonClient({ baseUrl: HOST, token: "tok" });
  expect(await client.listRoutines("Houston/Assistant")).toEqual([]);
  expect(calls).toHaveLength(0);
});
