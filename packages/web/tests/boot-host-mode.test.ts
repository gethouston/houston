import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyHostModeGlobals,
  type HostModeGlobals,
} from "../src/boot-globals";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * PRODUCT-1627: the web entry owns the host-mode boot contract on BOTH paths.
 *
 * The adapter reads `window.__HOUSTON_CP__` once, in its constructor, and a
 * client built without it routes routines/skills to a silent `[]` (see
 * `client/routines-skills-mixin.ts`) — no request, no error, an empty screen.
 * The self-host branch used to inherit the flag purely from an app/src
 * module-load side effect (`app/src/lib/engine.ts`, HOU-546), with nothing
 * pinning the coupling. These tests assert host mode holds on the web entry's
 * own globals, with no app module loaded.
 */

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

/** Stand in for the browser window the entry writes to, then reads back. */
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
  // First visit: the Connect screen prompts. Host mode must not wait for it,
  // and no placeholder endpoint may be invented.
  const win = bootWindow(null);
  expect(win.__HOUSTON_CP__).toBe(true);
  expect(win.__HOUSTON_ENGINE__).toBeUndefined();
});

test("a client built on those globals routes routines, not a silent empty list", async () => {
  bootWindow({ baseUrl: HOST, token: "tok" });
  // No `controlPlane` option — exactly how app/src/lib/engine.ts builds it, so
  // the window flag is the only thing deciding host mode.
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
