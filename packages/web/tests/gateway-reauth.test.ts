import {
  cpFetch,
  gatewayAuthFetch,
} from "@houston/engine-adapter/control-plane";
import { resetRejectedBearers } from "@houston/engine-adapter/cp/bearer-recovery";
import { REJECTED_MINT_VERIFY_DELAY_MS } from "@houston/engine-adapter/cp/rejected-mint";
import { refreshLiveToken } from "@houston/engine-adapter/session-refresh";
import { afterEach, expect, test, vi } from "vitest";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  globalThis.fetch = originalFetch;
  resetRejectedBearers();
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
  const refresh = vi.fn(async () => "stale");
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401));

  const res = await gatewayAuthFetch(CFG.token)("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(await errorFieldOf(res)).toBe("signed_out");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(1);
});

test("a genuinely NEW fresh bearer the gateway keeps rejecting stays LOUD", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const refresh = vi.fn(async () => "minted-secret");
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(401), json(401));

  const pending = gatewayAuthFetch(CFG.token)("https://gateway.example/x");
  await vi.advanceTimersByTimeAsync(REJECTED_MINT_VERIFY_DELAY_MS);
  const res = await pending;

  expect(res.status).toBe(401);
  expect(await errorFieldOf(res)).toBe(null);
  expect(calls.map(bearerOf)).toEqual([
    "Bearer stale",
    "Bearer minted-secret",
    "Bearer minted-secret",
  ]);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain("[gateway-bearer]");
  expect(warn.mock.calls[0][0]).not.toContain("minted-secret");
  warn.mockRestore();
});

test("a fresh bearer refused on replay heals on the one delayed re-send (PRODUCT-1812)", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const refresh = vi.fn(async () => "fresh");
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(401), json(200, { ok: true }));

  const pending = gatewayAuthFetch(CFG.token)("https://gateway.example/x");
  await vi.advanceTimersByTimeAsync(REJECTED_MINT_VERIFY_DELAY_MS);
  const res = await pending;

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls.map(bearerOf)).toEqual([
    "Bearer stale",
    "Bearer fresh",
    "Bearer fresh",
  ]);
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

test("N joiners of one refresh whose mint is refused go loud ONCE (PRODUCT-1812)", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const refresh = vi.fn(async () => "b2");
  setEngineWindow({ token: "b1", refresh, controlPlane: true });
  const calls = stubFetch(
    json(401),
    json(401),
    json(401),
    json(401),
    json(401),
    json(401),
    json(401),
  );

  const pending = Promise.all(
    ["x", "y", "z"].map((path) =>
      gatewayAuthFetch("b1")(`https://gateway.example/${path}`),
    ),
  );
  await vi.advanceTimersByTimeAsync(REJECTED_MINT_VERIFY_DELAY_MS);
  const answers = await Promise.all(
    (await pending).map((res) => errorFieldOf(res)),
  );

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(7);
  expect(answers.filter((a) => a === null)).toHaveLength(1);
  expect(answers.filter((a) => a === "signed_out")).toHaveLength(2);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("siblings of a verified mint replay their own requests and heal (PRODUCT-1812)", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn(async () => "b2");
  setEngineWindow({ token: "b1", refresh, controlPlane: true });
  const calls = stubFetch(
    json(401),
    json(401),
    json(401),
    json(401),
    json(200, { owner: true }),
    json(200, { sibling: true }),
  );

  const pending = Promise.all([
    gatewayAuthFetch("b1")("https://gateway.example/x"),
    gatewayAuthFetch("b1")("https://gateway.example/y"),
  ]);
  await vi.advanceTimersByTimeAsync(REJECTED_MINT_VERIFY_DELAY_MS);
  const [first, second] = await pending;

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(calls).toHaveLength(6);
  expect(calls.slice(4).map((c) => c.url)).toEqual([
    "https://gateway.example/x",
    "https://gateway.example/y",
  ]);
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

  const again = vi.fn(async () => "fresher");
  setEngineWindow({ token: "fresh", refresh: again });
  expect(await refreshLiveToken()).toBe("fresher");
});

test("reads retry through a transient gateway-roll status", async () => {
  vi.useFakeTimers();
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(503), json(200, []));

  const pending = cpFetch(CFG, "/agents");
  await vi.advanceTimersByTimeAsync(600);

  expect((await pending).status).toBe(200);
  expect(calls).toHaveLength(2);
});

test("writes never blind-retry a transient status", async () => {
  setEngineWindow({ token: "tok" });
  const calls = stubFetch(json(503));

  await expect(
    cpFetch(CFG, "/agents", {
      method: "POST",
      body: JSON.stringify({ name: "new agent" }),
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(calls).toHaveLength(1);
});

test("the boot-race bearer settles through the same 401 recovery (PRODUCT-1737)", async () => {
  const refresh = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValueOnce("slept-out")
    .mockResolvedValueOnce("fresh");
  setEngineWindow({ token: "", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(200, { ok: true }));

  const res = await gatewayAuthFetch("")("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(calls.map(bearerOf)).toEqual(["Bearer slept-out", "Bearer fresh"]);
});

test("a bearer a sibling request already had rejected is never replayed (PRODUCT-1737)", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const refresh = vi.fn(async () => "b2");
  setEngineWindow({ token: "b1", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(401), json(401), json(401));

  const pending = gatewayAuthFetch("b1")("https://gateway.example/x");
  await vi.advanceTimersByTimeAsync(REJECTED_MINT_VERIFY_DELAY_MS);
  const first = await pending;
  expect(first.status).toBe(401);
  expect(await errorFieldOf(first)).toBe(null);
  expect(calls.map(bearerOf)).toEqual(["Bearer b1", "Bearer b2", "Bearer b2"]);

  const second = await gatewayAuthFetch("b1")("https://gateway.example/y");
  expect(second.status).toBe(401);
  expect(await errorFieldOf(second)).toBe("signed_out");
  expect(calls).toHaveLength(4);
  warn.mockRestore();
});

test("a refresher that lands one tick after the 401 is still used (PRODUCT-1737)", async () => {
  setEngineWindow({ token: "stale", controlPlane: true });
  const calls = stubFetch(json(401), json(200, { ok: true }));
  const refresh = vi.fn(async () => "fresh");
  setTimeout(() => {
    (
      window as { __HOUSTON_SESSION_REFRESH__?: typeof refresh }
    ).__HOUSTON_SESSION_REFRESH__ = refresh;
  }, 0);

  const res = await gatewayAuthFetch("stale")("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(calls.map(bearerOf)).toEqual(["Bearer stale", "Bearer fresh"]);
});

test("a hosted 401 with no refresher at all stays raw and leaves a breadcrumb", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  setEngineWindow({ token: "stale", controlPlane: true });
  const calls = stubFetch(json(401, { error: "invalid or expired token" }));

  const res = await gatewayAuthFetch("stale")("https://gateway.example/x");

  expect(res.status).toBe(401);
  expect(await errorFieldOf(res)).toBe("invalid or expired token");
  expect(calls).toHaveLength(1);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("no session refresher installed"),
  );
  warn.mockRestore();
});

function jwtExpiringIn(expOffsetS: number, tag: string): string {
  const nowS = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc({ alg: "RS256", kid: tag })}.${enc({
    sub: "uid",
    iat: nowS + expOffsetS - 3600,
    exp: nowS + expOffsetS,
    tag,
  })}.sig`;
}

test("a refreshed bearer already expired by its own claims is never replayed; the refresher is asked once more (HOUSTON-APP-5HZ)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const sleptOut = jwtExpiringIn(-1_621, "slept");
  const fresh = jwtExpiringIn(3_600, "fresh");
  const refresh = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValueOnce(sleptOut)
    .mockResolvedValueOnce(fresh);
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(200, { ok: true }));

  const res = await gatewayAuthFetch("stale")("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(calls.map(bearerOf)).toEqual(["Bearer stale", `Bearer ${fresh}`]);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain("[gateway-bearer]");
  expect(warn.mock.calls[0][0]).toContain("expires_in_s=-16");
  expect(warn.mock.calls[0][0]).not.toContain(sleptOut);
  warn.mockRestore();
});

test("a second answer still expired by its claims replays once and lets the gateway judge", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const first = jwtExpiringIn(-7_200, "clock-a");
  const second = jwtExpiringIn(-7_200, "clock-b");
  const refresh = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(json(401), json(200, { ok: true }));

  const res = await gatewayAuthFetch("stale")("https://gateway.example/x");

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(calls.map(bearerOf)).toEqual(["Bearer stale", `Bearer ${second}`]);
  warn.mockRestore();
});

test("N joiners handed one slept-out bearer share ONE extra refresh", async () => {
  const sleptOut = jwtExpiringIn(-5_221, "slept");
  const fresh = jwtExpiringIn(3_600, "fresh");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const refresh = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValueOnce(sleptOut)
    .mockResolvedValue(fresh);
  setEngineWindow({ token: "stale", refresh, controlPlane: true });
  const calls = stubFetch(
    json(401),
    json(401),
    json(401),
    json(200, { x: true }),
    json(200, { y: true }),
    json(200, { z: true }),
  );

  const answers = await Promise.all(
    ["x", "y", "z"].map((path) =>
      gatewayAuthFetch("stale")(`https://gateway.example/${path}`),
    ),
  );

  expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(calls.slice(3).map(bearerOf)).toEqual(
    Array(3).fill(`Bearer ${fresh}`),
  );
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
