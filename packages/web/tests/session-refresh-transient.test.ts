import {
  isHoustonEngineError,
  isSignedOutEngineError,
} from "@houston/engine-adapter/client/errors";
import { cpFetch } from "@houston/engine-adapter/cp/fetch";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const CFG = { baseUrl: "https://gateway.example", token: "stale" };

const UNAUTHORIZED = () =>
  new Response(JSON.stringify({ error: "invalid or expired token" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const OK = () =>
  new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function stubGateway(): { bearers: (string | null)[] } {
  const bearers: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("Authorization");
      bearers.push(auth);
      return auth === "Bearer fresh" ? OK() : UNAUTHORIZED();
    }),
  );
  return { bearers };
}

function installRefresher(
  impl: () => Promise<string | null>,
  opts?: { controlPlane?: boolean },
): void {
  vi.stubGlobal("window", {
    __HOUSTON_SESSION_REFRESH__: vi.fn(impl),
    ...(opts?.controlPlane ? { __HOUSTON_CP__: true } : {}),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("transient refresh failure on a read self-heals on the blind retry", async () => {
  const gw = stubGateway();
  let calls = 0;
  installRefresher(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.reject(new TypeError("Load failed"));
    }
    return Promise.resolve("fresh");
  });
  const pending = cpFetch(CFG, "/agents/a/skills");
  await vi.advanceTimersByTimeAsync(2_000);
  const res = await pending;
  expect(res.status).toBe(200);
  expect(gw.bearers).toEqual(["Bearer stale", "Bearer stale", "Bearer fresh"]);
});

test("persistent transient refresh failure surfaces as transport, not auth", async () => {
  stubGateway();
  installRefresher(() =>
    Promise.reject(Object.assign(new Error("network"), { code: "network" })),
  );
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  const err = await pending;
  expect(err).toBeInstanceOf(TypeError);
  expect((err as TypeError).message).toBe("Load failed (session refresh)");
  expect(isHoustonEngineError(err)).toBe(false);
});

test("firebase network-request-failed is transient too", async () => {
  stubGateway();
  installRefresher(() =>
    Promise.reject(
      Object.assign(new Error("net"), { code: "auth/network-request-failed" }),
    ),
  );
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await pending).toBeInstanceOf(TypeError);
});

test("terminal refresh (null) outside hosted mode surfaces the real 401", async () => {
  stubGateway();
  installRefresher(() => Promise.resolve(null));
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  const err = await pending;
  expect(isHoustonEngineError(err)).toBe(true);
  expect((err as { status: number }).status).toBe(401);
  expect(isSignedOutEngineError(err)).toBe(false);
});

test("terminal refresh (null) in hosted mode is the quiet signed-out 401 (HOUSTON-APP-4WR)", async () => {
  const gw = stubGateway();
  installRefresher(() => Promise.resolve(null), { controlPlane: true });
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  const err = await pending;
  expect(isSignedOutEngineError(err)).toBe(true);
  expect(gw.bearers).toEqual(["Bearer stale"]);
});

test("an unexpected refresher bug is treated as terminal, not connectivity", async () => {
  stubGateway();
  installRefresher(() => Promise.reject(new Error("refresher exploded")));
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  const err = await pending;
  expect(isHoustonEngineError(err)).toBe(true);
  expect((err as { status: number }).status).toBe(401);
});

test("refresh succeeding replays with the fresh bearer (HOU-687 unchanged)", async () => {
  const gw = stubGateway();
  installRefresher(() => Promise.resolve("fresh"));
  const res = await cpFetch(CFG, "/agents/a/skills");
  expect(res.status).toBe(200);
  expect(gw.bearers).toEqual(["Bearer stale", "Bearer fresh"]);
});
