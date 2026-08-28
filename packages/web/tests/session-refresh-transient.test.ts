import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  isHoustonEngineError,
  isSignedOutEngineError,
} from "../src/engine-adapter/client/errors";
import { cpFetch } from "../src/engine-adapter/cp/fetch";

// HOU-1106 (Sentry HOUSTON-APP-515): a sleep-wake reconnect leaves every live
// query holding an expired bearer. The gateway answers 401, and the session
// refresh — racing the same settling network — can fail TRANSIENTLY. That
// must read as connectivity (a transport-shaped TypeError the app's
// classifier routes to the offline toast, retried for reads), never as the
// terminal "invalid or expired token" auth error it used to surface as.

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

/** Gateway stub: 401 for the stale bearer, 200 once "fresh" is presented. */
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
  // First refresh attempt loses to the settling network; the retry succeeds.
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
  // stale → (refresh threw, attempt dropped) → stale again → fresh replay.
  expect(gw.bearers).toEqual(["Bearer stale", "Bearer stale", "Bearer fresh"]);
});

test("persistent transient refresh failure surfaces as transport, not auth", async () => {
  stubGateway();
  installRefresher(() =>
    Promise.reject(
      Object.assign(new Error("network"), { code: "network" }), // desktop IdentityError shape
    ),
  );
  const pending = cpFetch(CFG, "/agents/a/skills").then(
    () => {
      throw new Error("expected rejection");
    },
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(5_000);
  const err = await pending;
  // The exact message the app's isNetworkTransportError classifier keys on:
  // this failure takes the connectivity path (info toast, no Sentry).
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
  // A real sign-out catches every live query holding the stale bearer: each
  // gets a gateway 401, refreshes (single-flight), and learns the session is
  // gone. That must fail the queries as signed-out — the state the error-toast
  // layer recognizes and never reports — not as one Sentry event per query.
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
  // No replay was attempted with a dead session: one gateway round trip only.
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
