import { afterEach, expect, test, vi } from "vitest";
import {
  gatewayAuthFetch,
  listAgents,
  renameAgent,
} from "../src/engine-adapter/control-plane";
import { refreshLiveToken } from "../src/engine-adapter/session-refresh";

/**
 * The 401 → refresh → replay seam (HOU-687): a gateway roll (or an access
 * token that expired while the app idled) must be invisible — the transport
 * re-mints the bearer and replays instead of surfacing a toast storm.
 */

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

/** Stub fetch with a queue of responses; records every (url, init) call. */
function stubFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

function bearerOf(call: { init: RequestInit | undefined }): string | null {
  return new Headers(call.init?.headers).get("Authorization");
}

const CFG = { baseUrl: "https://gateway.example", token: "captured" };

test("a 401 refreshes the session once and replays with the fresh bearer", async () => {
  const refresh = vi.fn(async () => "fresh");
  setEngineWindow({ token: "stale", refresh });
  const calls = stubFetch(json(401), json(200, { ok: true }));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls.map(bearerOf)).toEqual(["Bearer stale", "Bearer fresh"]);
});

test("a 401 with no refresher installed surfaces as-is", async () => {
  setEngineWindow({ token: "stale" });
  const calls = stubFetch(json(401));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(calls).toHaveLength(1);
});

test("a 401 whose refresh fails (real sign-out) surfaces as-is", async () => {
  setEngineWindow({ token: "stale", refresh: async () => null });
  const calls = stubFetch(json(401));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(calls).toHaveLength(1);
});

test("concurrent 401s share one refresh (single-flight)", async () => {
  let resolveRefresh: (token: string) => void = () => {};
  const refresh = vi.fn(
    () => new Promise<string | null>((r) => (resolveRefresh = r)),
  );
  setEngineWindow({ token: "stale", refresh });

  const first = refreshLiveToken();
  const second = refreshLiveToken();
  resolveRefresh("fresh");
  expect(await first).toBe("fresh");
  expect(await second).toBe("fresh");
  expect(refresh).toHaveBeenCalledTimes(1);

  // After settling, a later 401 starts a NEW refresh (not the stale result).
  const again = vi.fn(async () => "fresher");
  setEngineWindow({ token: "fresh", refresh: again });
  expect(await refreshLiveToken()).toBe("fresher");
});

test("reads retry through a transient gateway-roll status", async () => {
  vi.useFakeTimers();
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(503), json(200, []));

  const pending = listAgents(CFG);
  await vi.advanceTimersByTimeAsync(600);

  expect(await pending).toEqual([]);
  expect(calls).toHaveLength(2);
});

test("writes never blind-retry a transient status", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(503));

  await expect(renameAgent(CFG, "a1", "new name")).rejects.toMatchObject({
    status: 503,
  });
  expect(calls).toHaveLength(1);
});
