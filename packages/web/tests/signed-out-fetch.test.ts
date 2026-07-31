import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isSignedOutEngineError } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import { cpFetch } from "../src/engine-adapter/cp/fetch";

/**
 * HOU-1014: a hosted gateway call attempted with NO session must not go to the
 * network — the sign-out / account-switch window used to fire every mounted
 * query with an empty bearer, producing a storm of real 401s, red toasts, and
 * Sentry reports for an expected lifecycle state. The transport now answers a
 * synthetic signed-out 401 locally (after giving the refresher one chance to
 * bridge the boot race), and the error is marked so the toast layer stays
 * quiet. Local (non-control-plane) hosts are exempt — their token handling is
 * unchanged.
 */

type TestWindow = {
  __HOUSTON_CP__?: boolean;
  __HOUSTON_SESSION_REFRESH__?: () => Promise<string | null>;
};

const originalFetch = globalThis.fetch;
let calls: { url: string; auth: string | null }[];

beforeEach(() => {
  calls = [];
  (globalThis as { window?: TestWindow }).window = { __HOUSTON_CP__: true };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), auth: headers.get("Authorization") });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: TestWindow }).window;
  vi.restoreAllMocks();
});

const cfg = { baseUrl: "https://gw.test", token: "" };

test("no session at all → synthetic signed-out 401, zero network calls", async () => {
  const err = await cpFetch(cfg, "/v1/workspaces").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HoustonEngineError);
  expect((err as HoustonEngineError).status).toBe(401);
  expect(isSignedOutEngineError(err)).toBe(true);
  expect(calls).toHaveLength(0);
});

test("empty bearer but a live refresher (boot race) → one refreshed request", async () => {
  (globalThis as { window?: TestWindow }).window = {
    __HOUSTON_CP__: true,
    __HOUSTON_SESSION_REFRESH__: () => Promise.resolve("fresh-token"),
  };
  const res = await cpFetch(cfg, "/v1/workspaces");
  expect(res.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0].auth).toBe("Bearer fresh-token");
});

test("a real 401 from the gateway is NOT marked signed-out", async () => {
  (globalThis as { window?: TestWindow }).window = {
    __HOUSTON_CP__: true,
    __HOUSTON_ENGINE__: { baseUrl: "https://gw.test", token: "expired" },
  } as TestWindow;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "missing bearer token" }), {
      status: 401,
    })) as typeof fetch;
  const err = await cpFetch(
    { ...cfg, token: "expired" },
    "/v1/workspaces",
  ).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HoustonEngineError);
  expect((err as HoustonEngineError).status).toBe(401);
  expect(isSignedOutEngineError(err)).toBe(false);
});

test("local (non-control-plane) host keeps its unauthenticated behavior", async () => {
  (globalThis as { window?: TestWindow }).window = {};
  const res = await cpFetch(cfg, "/v1/health");
  expect(res.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0].auth).toBeNull();
});
