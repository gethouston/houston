import {
  cpFetch,
  gatewayAuthFetch,
  subscribeEvents,
} from "@houston/engine-adapter/control-plane";
import { afterEach, expect, test, vi } from "vitest";

const SLUG = "0123456789abcdef";

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
    org = "bbbbbbbbbbbbbbbb";
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

test("cpFetch carries the active-space header off cfg", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(200, []));
  await cpFetch(
    {
      baseUrl: "https://gateway.example",
      token: "tok",
      activeOrgSlug: SLUG,
    },
    "/agents",
  );
  expect(orgOf(calls[0])).toBe(SLUG);
});

test("cpFetch omits the header for a personal config", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(200, []));
  await cpFetch(
    { baseUrl: "https://gateway.example", token: "tok" },
    "/agents",
  );
  expect(orgOf(calls[0])).toBeNull();
});

test("subscribeEvents appends ?org= to the SSE URL for a team space", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const calls = stubFetchAlways(() => json(500));
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
