import { afterEach, expect, test, vi } from "vitest";
import {
  createAgent,
  gatewayAuthFetch,
  listAgents,
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
  controlPlane?: boolean;
}): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: {
        baseUrl: "https://gateway.example",
        token: opts.token,
      },
      __HOUSTON_SESSION_REFRESH__: opts.refresh,
      __HOUSTON_CP__: opts.controlPlane === true,
    },
  });
}

/** The `error` field of a JSON Response body, or null. `signedOutResponse`
 *  mints `{ error: "signed_out" }`, which the toast layer suppresses. */
async function errorFieldOf(res: Response): Promise<string | null> {
  const body = (await res.clone().json()) as { error?: string };
  return body.error ?? null;
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

test("a refresh that returns the SAME rejected bearer stays quiet, never replays", async () => {
  // On a wake-from-sleep burst, securetoken hands back the still-cached idToken
  // when refreshed twice inside one token's lifetime — no network mint (no
  // breadcrumb) — so the "fresh" bearer equals the one the gateway just
  // rejected. Replaying it earns the identical 401 and a raw expired-token
  // toast storm (HOUSTON-APP-4YD/53R/58P, PRODUCT-1664). Treat it as the quiet
  // synthetic signed-out state instead, and never send the doomed replay.
  const refresh = vi.fn(async () => "stale");
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(await errorFieldOf(res)).toBe("signed_out");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(1); // only the original attempt — no replay
});

test("a genuinely NEW fresh bearer the gateway still rejects stays LOUD", async () => {
  // The narrow same-bearer carve-out must not swallow a real bug: a token the
  // refresher actually minted anew, rejected on replay, is surfaced raw.
  const refresh = vi.fn(async () => "fresh");
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(401));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(await errorFieldOf(res)).toBe(null); // the gateway's raw 401, not signed_out
  expect(calls.map(bearerOf)).toEqual(["Bearer stale", "Bearer fresh"]);
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
  // listAgents also hydrates the `agent_colors` account preference
  // (PRODUCT-1344) in parallel; answer that side channel by URL so the
  // retry-under-test keeps a clean two-response queue for /agents itself.
  const agentResponses = [json(503), json(200, [])];
  const agentCalls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v1/preferences/")) return json(200, { value: null });
    agentCalls.push(url);
    const next = agentResponses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;

  const pending = listAgents(CFG);
  await vi.advanceTimersByTimeAsync(600);

  expect(await pending).toEqual([]);
  expect(agentCalls).toHaveLength(2);
});

test("writes never blind-retry a transient status", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(503));

  // `createAgent` is a POST — the cpFetch write path. transientRetryFetch only
  // blind-retries GET/HEAD, so a write surfaces the 503 on the first attempt.
  await expect(createAgent(CFG, "new agent")).rejects.toMatchObject({
    status: 503,
  });
  expect(calls).toHaveLength(1);
});
