import { afterEach, expect, test, vi } from "vitest";
import {
  gatewayAuthFetch,
  listAgents,
  subscribeEvents,
} from "../src/engine-adapter/control-plane";

/**
 * Active-space plumbing on the HOSTED path (C8 §Active space). The web adapter
 * is the client every cloud build actually runs, so the `x-houston-org` header
 * and the SSE `?org=` fallback have to land here — not only on the
 * engine-client shim surface.
 *
 * - `gatewayAuthFetch` injects `x-houston-org` from a live getter (present when
 *   a team space is active, absent for personal), re-read per attempt so a 401
 *   refresh-replay picks up a switch.
 * - `cpFetch` (via `listAgents`) threads the same getter off `cfg.activeOrgSlug`.
 * - `subscribeEvents` rides the slug as `?org=` beside `?token=` on `/v1/events`
 *   (browsers can't header a stream; the gateway's SSE routes take the query).
 */

const SLUG = "0123456789abcdef"; // [a-f0-9]{16}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setEngineWindow(opts: {
  token: string;
  refresh?: () => Promise<string | null>;
}): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: {
        baseUrl: "https://gateway.example",
        token: opts.token,
      },
      __HOUSTON_SESSION_REFRESH__: opts.refresh,
    },
  });
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** Stub fetch with a queue of responses; records every (url, init) call. */
function stubFetch(...responses: Response[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

/** Stub fetch that answers every call with a fresh response from `make`. */
function stubFetchAlways(make: () => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return make();
  }) as unknown as typeof fetch;
  return calls;
}

function orgOf(call: Call): string | null {
  return new Headers(call.init?.headers).get("x-houston-org");
}

test("gatewayAuthFetch sends x-houston-org when the getter yields a slug", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(200));
  await gatewayAuthFetch("tok", () => SLUG)("https://gateway.example/x");
  expect(orgOf(calls[0])).toBe(SLUG);
});

test("gatewayAuthFetch sends NO org header for personal (null / no getter)", async () => {
  setEngineWindow({ token: "tok" });
  const a = stubFetch(json(200));
  await gatewayAuthFetch("tok", () => null)("https://gateway.example/x");
  expect(orgOf(a[0])).toBeNull();

  const b = stubFetch(json(200));
  await gatewayAuthFetch("tok")("https://gateway.example/x");
  expect(orgOf(b[0])).toBeNull();
});

test("gatewayAuthFetch re-reads the org getter per attempt (401 replay)", async () => {
  let org: string | null = "aaaaaaaaaaaaaaaa";
  const refresh = vi.fn(async () => {
    org = "bbbbbbbbbbbbbbbb"; // a space switch that races the refresh
    return "fresh";
  });
  setEngineWindow({ token: "stale", refresh });
  const calls = stubFetch(json(401), json(200));

  const res = await gatewayAuthFetch(
    "stale",
    () => org,
  )("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(orgOf(calls[0])).toBe("aaaaaaaaaaaaaaaa");
  expect(orgOf(calls[1])).toBe("bbbbbbbbbbbbbbbb");
});

test("cpFetch (listAgents) carries the active-space header off cfg", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(200, []));
  await listAgents({
    baseUrl: "https://gateway.example",
    token: "tok",
    activeOrgSlug: SLUG,
  });
  expect(orgOf(calls[0])).toBe(SLUG);
});

test("cpFetch omits the header for a personal config", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(200, []));
  await listAgents({ baseUrl: "https://gateway.example", token: "tok" });
  expect(orgOf(calls[0])).toBeNull();
});

test("subscribeEvents appends ?org= to the SSE URL for a team space", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const calls = stubFetchAlways(() => json(500)); // non-ok → reconnect loop
  const stop = subscribeEvents(
    { baseUrl: "https://gateway.example", token: "tok", activeOrgSlug: SLUG },
    () => {},
  );
  await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
  stop();
  expect(calls[0].url).toContain("token=tok");
  expect(calls[0].url).toContain(`org=${SLUG}`);
});

test("subscribeEvents omits ?org= for a personal space", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const calls = stubFetchAlways(() => json(500));
  const stop = subscribeEvents(
    { baseUrl: "https://gateway.example", token: "tok" },
    () => {},
  );
  await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
  stop();
  expect(calls[0].url).toContain("token=tok");
  expect(calls[0].url).not.toContain("org=");
});
