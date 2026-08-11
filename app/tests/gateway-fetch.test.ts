import { deepStrictEqual, match, ok, rejects, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  type GatewayFetchDeps,
  gatewayFetch,
  liveGatewayDeps,
} from "../src/lib/gateway-fetch.ts";

interface Sent {
  url: string;
  method: string;
  bearer: string | null;
  org: string | null;
  appVersion: string | null;
  contentType: string | null;
  body: string | null;
}

function deps(
  responses: Array<Response | Error>,
  sent: Sent[],
  overrides?: Partial<GatewayFetchDeps>,
): GatewayFetchDeps {
  return {
    baseUrl: "https://gw.example/",
    token: () => "tok-1",
    refresh: async () => null,
    appVersion: () => "0.5.9+cloud",
    org: () => null,
    fetchFn: async (input, init) => {
      const headers = new Headers(init?.headers);
      sent.push({
        url: String(input),
        method: init?.method ?? "GET",
        bearer: headers.get("Authorization"),
        org: headers.get("x-houston-org"),
        appVersion: headers.get("X-Houston-App-Version"),
        contentType: headers.get("Content-Type"),
        body: typeof init?.body === "string" ? init.body : null,
      });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? new Response(null, { status: 500 });
    },
    ...overrides,
  };
}

/** Give queued microtasks/timers a turn before asserting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("gatewayFetch", () => {
  it("identifies the build on every request", async () => {
    const sent: Sent[] = [];
    const res = await gatewayFetch(
      deps([new Response(null, { status: 204 })], sent),
      "/v1/me",
      { method: "DELETE" },
    );
    strictEqual(res?.status, 204);
    deepStrictEqual(sent, [
      {
        url: "https://gw.example/v1/me",
        method: "DELETE",
        bearer: "Bearer tok-1",
        org: null,
        appVersion: "0.5.9+cloud",
        contentType: null,
        body: null,
      },
    ]);
  });

  it("sends no version header where there is no app build (web, tests)", async () => {
    const sent: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, {
        appVersion: () => null,
      }),
      "/v1/me",
    );
    strictEqual(sent[0].appVersion, null);
  });

  it("refreshes once and replays on a 401", async () => {
    const sent: Sent[] = [];
    let refreshes = 0;
    const res = await gatewayFetch(
      deps(
        [
          new Response(null, { status: 401 }),
          new Response(null, { status: 200 }),
        ],
        sent,
        {
          token: () => "stale",
          refresh: async () => {
            refreshes++;
            return "fresh";
          },
        },
      ),
      "/v1/me",
    );
    strictEqual(refreshes, 1);
    strictEqual(res?.status, 200);
    deepStrictEqual(
      sent.map((s) => s.bearer),
      ["Bearer stale", "Bearer fresh"],
    );
  });

  it("hands back a 401 that survives the refresh", async () => {
    const sent: Sent[] = [];
    const res = await gatewayFetch(
      deps([new Response(null, { status: 401 })], sent, {
        token: () => "stale",
      }),
      "/v1/me",
    );
    strictEqual(res?.status, 401);
    strictEqual(sent.length, 1);
  });

  it("sends nothing at all when there is no session", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await gatewayFetch(
        deps([new Response(null, { status: 200 })], sent, {
          token: () => undefined,
        }),
        "/v1/me",
      ),
      null,
    );
    strictEqual(sent.length, 0);
  });

  it("bridges the boot race by minting a bearer before the first attempt", async () => {
    const sent: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, {
        token: () => undefined,
        refresh: async () => "restored",
      }),
      "/v1/me",
    );
    deepStrictEqual(
      sent.map((s) => s.bearer),
      ["Bearer restored"],
    );
  });

  it("lets a transport failure through to the caller", async () => {
    const boom = new TypeError("Load failed");
    let thrown: unknown;
    try {
      await gatewayFetch(deps([boom], []), "/v1/me");
    } catch (e) {
      thrown = e;
    }
    strictEqual(thrown, boom);
  });

  it("stops after the replay when the 401 survives it", async () => {
    // One refresh, one replay, then the caller's problem: a gateway that keeps
    // answering 401 must not be hammered in a loop.
    const sent: Sent[] = [];
    const res = await gatewayFetch(
      deps(
        [
          new Response(null, { status: 401 }),
          new Response(null, { status: 401 }),
        ],
        sent,
        { token: () => "stale", refresh: async () => "fresh" },
      ),
      "/v1/me",
    );
    strictEqual(res?.status, 401);
    strictEqual(sent.length, 2);
  });

  it("carries the caller's headers and body into the replay", async () => {
    // Migration-critical: a chunk upload that 401s mid-flight is replayed, and
    // a replay that dropped the zip would import an empty agent.
    const sent: Sent[] = [];
    await gatewayFetch(
      deps(
        [
          new Response(null, { status: 401 }),
          new Response(null, { status: 200 }),
        ],
        sent,
        { refresh: async () => "fresh", org: () => "0123456789abcdef" },
      ),
      "/agents/a1/migration/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: "ZIPBYTES",
      },
    );
    deepStrictEqual(
      sent.map((s) => [s.method, s.contentType, s.body, s.org]),
      [
        ["POST", "application/zip", "ZIPBYTES", "0123456789abcdef"],
        ["POST", "application/zip", "ZIPBYTES", "0123456789abcdef"],
      ],
    );
  });
});

describe("gatewayFetch active space", () => {
  it("pins the team space on every attempt when one is selected", async () => {
    const sent: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, {
        org: () => "fedcba9876543210",
      }),
      "/agents/a1/migration/status",
    );
    strictEqual(sent[0].org, "fedcba9876543210");
  });

  it("sends no header for the personal space", async () => {
    // Absent ⇒ the gateway resolves the caller's personal org, which is the
    // right answer for `/v1/me/*` and for a personal-space agent alike.
    const sent: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, { org: () => null }),
      "/v1/me/onboarding",
    );
    strictEqual(sent[0].org, null);
    const undef: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], undef, {
        org: () => undefined,
      }),
      "/v1/me/onboarding",
    );
    strictEqual(undef[0].org, null);
  });

  it("falls back to the app-installed active-space global", async () => {
    // `liveGatewayDeps` wires no org getter of its own, so the migration
    // transport picks the workspace switcher's pin up for free — which is the
    // whole point: `/agents/:slug/migration/*` is org-scoped, and without the
    // header the gateway resolved the personal space and 404'd every
    // team-space agent.
    (globalThis as { window?: Record<string, unknown> }).window = {
      __HOUSTON_ACTIVE_ORG__: "abcdef0123456789",
    };
    try {
      const sent: Sent[] = [];
      const { org: _unset, ...noOrgDeps } = deps(
        [new Response(null, { status: 200 })],
        sent,
      );
      await gatewayFetch(noOrgDeps, "/agents/a1/migration/import");
      strictEqual(sent[0].org, "abcdef0123456789");
    } finally {
      (globalThis as { window?: unknown }).window = undefined;
    }
  });

  it("leaves the pin off a request that opts out, active space or not", async () => {
    // `/v1/me/*` is USER-scoped, but the gateway resolves the pin BEFORE the
    // handler and derives the write gate's billing from it: with the header on,
    // a plain member of an expired team ate a silent 403 on their OWN
    // onboarding answers (and burned the once-per-account catch-up on it).
    const sent: Sent[] = [];
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, {
        org: () => "fedcba9876543210",
      }),
      "/v1/me/onboarding",
      { method: "PUT", body: "{}", orgScoped: false },
    );
    strictEqual(sent[0].org, null);
    // …and the opt-out survives the 401 replay, which builds its headers again.
    const replayed: Sent[] = [];
    await gatewayFetch(
      deps(
        [
          new Response(null, { status: 401 }),
          new Response(null, { status: 200 }),
        ],
        replayed,
        { org: () => "fedcba9876543210", refresh: async () => "fresh" },
      ),
      "/v1/me/onboarding",
      { method: "PUT", body: "{}", orgScoped: false },
    );
    deepStrictEqual(
      replayed.map((s) => [s.org, s.body]),
      [
        [null, "{}"],
        [null, "{}"],
      ],
    );
  });

  it("still pins by default, and never sends the flag as a fetch option", async () => {
    // The default is the canonical `cp/fetch` behaviour — an org-scoped caller
    // must not have to remember anything.
    const sent: Sent[] = [];
    let init: RequestInit | undefined;
    await gatewayFetch(
      deps([new Response(null, { status: 200 })], sent, {
        org: () => "0123456789abcdef",
        fetchFn: async (_input, requestInit) => {
          init = requestInit;
          sent.push({
            url: "",
            method: requestInit?.method ?? "GET",
            bearer: null,
            org: new Headers(requestInit?.headers).get("x-houston-org"),
            appVersion: null,
            contentType: null,
            body: null,
          });
          return new Response(null, { status: 200 });
        },
      }),
      "/agents/a1/migration/status",
      { orgScoped: true },
    );
    strictEqual(sent[0].org, "0123456789abcdef");
    strictEqual((init as { orgScoped?: unknown })?.orgScoped, undefined);
  });

  it("re-reads the slug per attempt, so a mid-flight switch is honoured", async () => {
    const sent: Sent[] = [];
    let slug = "1111111111111111";
    await gatewayFetch(
      deps(
        [
          new Response(null, { status: 401 }),
          new Response(null, { status: 200 }),
        ],
        sent,
        {
          org: () => slug,
          refresh: async () => {
            slug = "2222222222222222";
            return "fresh";
          },
        },
      ),
      "/agents/a1/migration/status",
    );
    deepStrictEqual(
      sent.map((s) => s.org),
      ["1111111111111111", "2222222222222222"],
    );
  });
});

describe("gatewayFetch concurrent refresh", () => {
  it("collapses a 401 storm into ONE refresher call", async () => {
    // Refresh tokens ROTATE on use: two racing mints can invalidate each other
    // and sign the user out. The canonical `session-refresh.ts` holds the same
    // single-flight latch, and this transport is its app-side peer.
    const sent: Sent[] = [];
    let refreshes = 0;
    let release: () => void = () => {};
    const minting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const shared = deps(
      [401, 401, 200, 200].map((status) => new Response(null, { status })),
      sent,
      {
        token: () => "stale",
        refresh: async () => {
          refreshes++;
          await minting;
          return "fresh";
        },
      },
    );
    const both = Promise.all([
      gatewayFetch(shared, "/v1/me/onboarding", { orgScoped: false }),
      gatewayFetch(shared, "/agents/a1/migration/status"),
    ]);
    // Both first attempts must reach the refresher before it settles.
    await settle();
    release();
    const answers = await both;

    strictEqual(refreshes, 1);
    deepStrictEqual(
      answers.map((res) => res?.status),
      [200, 200],
    );
    deepStrictEqual(
      sent.map((s) => s.bearer),
      ["Bearer stale", "Bearer stale", "Bearer fresh", "Bearer fresh"],
    );
  });

  it("starts a fresh mint for a caller that arrives after it settles", async () => {
    const sent: Sent[] = [];
    let refreshes = 0;
    const shared = deps(
      [401, 200, 401, 200].map((status) => new Response(null, { status })),
      sent,
      {
        token: () => "stale",
        refresh: async () => {
          refreshes++;
          return "fresh";
        },
      },
    );
    await gatewayFetch(shared, "/v1/me");
    await gatewayFetch(shared, "/v1/me");
    strictEqual(refreshes, 2);
  });

  it("hands every joiner the same transient-failure classification", async () => {
    let refreshes = 0;
    let release: () => void = () => {};
    const minting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const shared = deps(
      [401, 401].map((status) => new Response(null, { status })),
      [],
      {
        refresh: async () => {
          refreshes++;
          await minting;
          throw new TypeError("Failed to fetch");
        },
      },
    );
    const both = Promise.allSettled([
      gatewayFetch(shared, "/v1/me"),
      gatewayFetch(shared, "/v1/me"),
    ]);
    await settle();
    release();
    const results = await both;
    strictEqual(refreshes, 1);
    for (const result of results) {
      strictEqual(result.status, "rejected");
      ok(result.status === "rejected" && result.reason instanceof TypeError);
      match((result as PromiseRejectedResult).reason.message, /^Load failed/);
    }
  });
});

describe("gatewayFetch refresh failures", () => {
  it("surfaces a transient refresh failure as connectivity, not auth", async () => {
    // HOU-1106: swallowing this to null turned every sleep-wake refresh race
    // into a bogus expired-session failure. The "Load failed" prefix is what
    // `lib/network-transport-error.ts` classifies on.
    for (const boom of [
      new TypeError("Failed to fetch"),
      Object.assign(new Error("offline"), { code: "network" }),
      Object.assign(new Error("firebase"), {
        code: "auth/network-request-failed",
      }),
    ]) {
      await rejects(
        () =>
          gatewayFetch(
            deps([new Response(null, { status: 401 })], [], {
              refresh: async () => {
                throw boom;
              },
            }),
            "/v1/me",
          ),
        (err: unknown) => {
          ok(err instanceof TypeError);
          match(err.message, /^Load failed/);
          strictEqual((err as { cause?: unknown }).cause, boom);
          return true;
        },
      );
    }
  });

  it("still lets the 401 stand when the refresher fails unexpectedly", async () => {
    // A refresher BUG is not connectivity; the response the gateway actually
    // gave is the honest answer.
    const sent: Sent[] = [];
    const res = await gatewayFetch(
      deps([new Response(null, { status: 401 })], sent, {
        refresh: async () => {
          throw new RangeError("refresher bug");
        },
      }),
      "/v1/me",
    );
    strictEqual(res?.status, 401);
    strictEqual(sent.length, 1);
  });

  it("classifies the boot-race refresh the same way", async () => {
    await rejects(
      () =>
        gatewayFetch(
          deps([new Response(null, { status: 200 })], [], {
            token: () => undefined,
            refresh: async () => {
              throw new TypeError("fetch failed");
            },
          }),
          "/v1/me",
        ),
      TypeError,
    );
  });
});

describe("liveGatewayDeps", () => {
  const win = () => (globalThis as { window?: Record<string, unknown> }).window;
  const setWindow = (value: Record<string, unknown> | undefined) => {
    (globalThis as { window?: Record<string, unknown> }).window = value;
  };
  afterEach(() => setWindow(undefined));

  it("is null with no window and with no gateway configured", () => {
    strictEqual(liveGatewayDeps(), null);
    setWindow({});
    strictEqual(liveGatewayDeps(), null);
    setWindow({ __HOUSTON_ENGINE__: { baseUrl: "", token: "t" } });
    strictEqual(liveGatewayDeps(), null);
  });

  it("reads the base URL, bearer and refresher live off the globals", async () => {
    setWindow({
      __HOUSTON_ENGINE__: { baseUrl: "https://gw.example", token: "" },
      __HOUSTON_SESSION_REFRESH__: async () => "minted",
    });
    const live = liveGatewayDeps();
    ok(live);
    strictEqual(live.baseUrl, "https://gw.example");
    // An empty token reads as "no bearer yet", not as the empty string.
    strictEqual(live.token(), undefined);
    const w = win();
    ok(w);
    (w.__HOUSTON_ENGINE__ as { token: string }).token = "rotated";
    strictEqual(live.token(), "rotated");
    strictEqual(await live.refresh(), "minted");
  });

  it("resolves the refresher to null when the shell installed none", async () => {
    setWindow({
      __HOUSTON_ENGINE__: { baseUrl: "https://gw.example", token: "t" },
    });
    const live = liveGatewayDeps();
    ok(live);
    strictEqual(await live.refresh(), null);
  });
});
