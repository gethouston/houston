import { HoustonClient } from "@houston/engine-adapter/client";
import {
  HoustonEngineError,
  isSignedOutEngineError,
} from "@houston/engine-adapter/client/errors";
import {
  toHoustonEngineError,
  viaSdk,
} from "@houston/engine-adapter/client/sdk-error";
import * as controlPlane from "@houston/engine-adapter/control-plane";
import { HANDOFF_RETRY_DELAYS_MS } from "@houston/engine-adapter/cp/unavailable-reason";
import {
  WAKING_EPISODE_GAP_MS,
  WAKING_STUCK_THRESHOLD_MS,
  wakingStuckTracker,
} from "@houston/engine-adapter/waking-stuck-tracker";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The account-preference READ, and the transport property that lets a READ be
 * delegated at all: the SDK's fetch port wraps GETs in the same reason-aware
 * read retry `cpFetch` does (`sdk-client.ts`).
 *
 * `getPreference` pins both halves — the request the delegated read issues, and
 * the attempts a transient 503 earns it — against the control-plane helper, in
 * the same file, on the same stub.
 *
 * `client/sdk-error.ts` is the other half: the SDK's transports throw their own
 * error classes carrying a TEXT body, and the app catches `HoustonEngineError`.
 */

const BASE = "http://host";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

describe("the delegated account-preference read", () => {
  test("issues the request the control-plane helper did", async () => {
    stubFetch(() => json(200, { value: "Europe/Madrid" }));
    const c = client();
    c.setActiveOrg(ORG);

    expect(await c.getPreference("timezone")).toBe("Europe/Madrid");
    expect(calls).toHaveLength(1);
    const [delegated] = calls;

    reset();
    await controlPlane.getPreference(
      { baseUrl: BASE, token: "t", activeOrgSlug: ORG },
      "timezone",
    );
    const [helper] = calls;

    expect(delegated.url).toBe(`${BASE}/v1/preferences/timezone`);
    expect(delegated.url).toBe(helper.url);
    expect(delegated.method).toBe(helper.method);
    expect(delegated.body).toBe(helper.body);
    expect(delegated.headers.get("Authorization")).toBe("Bearer t");
    expect(delegated.headers.get("x-houston-org")).toBe(ORG);
    // The ONE header that differs, and the whole of the difference: `cpFetch`
    // stamps a JSON content type on every request including this bodyless GET,
    // where the runtime client sends one only with a body. Spelling it out
    // means a change to either transport has to come back and edit this line.
    expect([...helper.headers.keys()].sort()).toEqual(
      [...delegated.headers.keys(), "content-type"].sort(),
    );
    expect(delegated.headers.get("Content-Type")).toBeNull();
  });

  test("routes an account key through the preference path", async () => {
    stubFetch(() => json(200, { value: "1" }));
    await client().getPreference("onboarding_completed");
    expect(calls[0].url).toBe(`${BASE}/v1/preferences/onboarding_completed`);
  });

  test("the chosen space follows the account through GET and PUT", async () => {
    const value = `org:${ORG}`;
    stubFetch(() => json(200, { value }));
    const c = client();
    c.setActiveOrg(ORG);

    expect(await c.getPreference("last_workspace_id")).toBe(value);
    await c.setPreference("last_workspace_id", value);

    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ["GET", `${BASE}/v1/preferences/last_workspace_id`, null],
      [
        "PUT",
        `${BASE}/v1/preferences/last_workspace_id`,
        JSON.stringify({ value }),
      ],
    ]);
    for (const call of calls) {
      expect(call.headers.get("Authorization")).toBe("Bearer t");
      expect(call.headers.get("x-houston-org")).toBeNull();
    }
    expect(calls[0].headers.get("Content-Type")).toBeNull();
    expect(calls[1].headers.get("Content-Type")).toBe("application/json");
  });

  test("a transient 503 earns the same attempts cpFetch would", async () => {
    // A 5xx body the gateway vocabulary does not recognise reads as the
    // `handoff` reason: two brief blind retries, three attempts in all. The
    // ladder runs on fake timers — what is pinned is the COUNT of attempts,
    // and sleeping the real delays buys nothing but four seconds.
    vi.useFakeTimers();
    try {
      stubFetch(() => json(503, { error: "gateway rolling" }));

      // The rejection handler is attached BEFORE the timers run: a ladder that
      // settles inside `runAllTimersAsync` with nobody listening surfaces as an
      // unhandled rejection and fails the whole file.
      const delegated = expect(
        client().getPreference("timezone"),
      ).rejects.toThrow();
      await vi.runAllTimersAsync();
      await delegated;
      const attempts = calls.length;

      reset();
      const viaControlPlane = expect(
        controlPlane.getPreference({ baseUrl: BASE, token: "t" }, "timezone"),
      ).rejects.toThrow();
      await vi.runAllTimersAsync();
      await viaControlPlane;

      expect(attempts).toBe(calls.length);
      expect(attempts).toBe(HANDOFF_RETRY_DELAYS_MS.length + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the account-key WRITE is still exactly one request", async () => {
    stubFetch(() => json(200, { value: "Europe/Madrid" }));
    await client().setPreference("timezone", "Europe/Madrid");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/v1/preferences/timezone`);
    expect(calls[0].body).toBe(JSON.stringify({ value: "Europe/Madrid" }));
  });
});

describe("translating an SDK transport failure", () => {
  /** What `modules/http.ts` throws: an Error stamped with the HTTP status. */
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  /** What a runtime-client sub-client throws: the body kept on `.body`. */
  class EngineError extends Error {
    constructor(
      readonly status: number,
      readonly body: string,
    ) {
      super(`engine request failed (${status}): ${body}`);
    }
  }

  test("a signed-out 401 stays recognisable as one", () => {
    const body = JSON.stringify({ error: "signed_out" });
    expect(
      isSignedOutEngineError(
        toHoustonEngineError(new HttpError(body, 401), "/v1/org"),
      ),
    ).toBe(true);
    expect(
      isSignedOutEngineError(
        toHoustonEngineError(
          new EngineError(401, body),
          "/v1/preferences/locale",
        ),
      ),
    ).toBe(true);
  });

  test("a real 401 is NOT mistaken for the signed-out one", () => {
    const err = toHoustonEngineError(
      new HttpError(JSON.stringify({ error: "bad token" }), 401),
      "/v1/org",
    );
    expect(isSignedOutEngineError(err)).toBe(false);
  });

  test("a 404 keeps its status, so the mixin degradations still fire", () => {
    const err = toHoustonEngineError(
      new HttpError(JSON.stringify({ error: "not found" }), 404),
      "/v1/org/people",
    );
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(404);
    expect((err as HoustonEngineError).agentId).toBeUndefined();
  });

  test("a body that is not JSON degrades to {}, as cpFetch resolves one", () => {
    const err = toHoustonEngineError(
      new HttpError("<html>502</html>", 502),
      "/v1/org",
    );
    expect((err as HoustonEngineError).body).toEqual({});
  });

  test("the agent id is re-derived from a per-agent path", () => {
    const err = toHoustonEngineError(
      new HttpError("{}", 500),
      "/agents/a%201/activities/m1",
    );
    expect((err as HoustonEngineError).agentId).toBe("a 1");
  });

  test("a failure with no HTTP status passes through untouched", () => {
    const boom = new TypeError("network down");
    expect(toHoustonEngineError(boom, "/v1/org")).toBe(boom);
  });
});

describe("stuck-wake parity", () => {
  /** Waking answers spaced inside the gap, reaching the escalation threshold. */
  const timeline = (): number[] => {
    const points: number[] = [];
    for (
      let at = 0;
      at < WAKING_STUCK_THRESHOLD_MS;
      at += WAKING_EPISODE_GAP_MS
    )
      points.push(at);
    return [...points, WAKING_STUCK_THRESHOLD_MS];
  };

  /** Walk one agent's episode, optionally landing a success partway through. */
  const walk = async (key: string, succeedAt?: number): Promise<boolean> => {
    let escalated = false;
    for (const at of timeline()) {
      if (at === succeedAt)
        await viaSdk(`/agents/${key}/activities`, async () => "ok");
      escalated ||= wakingStuckTracker.noteWaking(key, "waking", at) !== null;
    }
    return escalated;
  };

  test("an agent answering waking for the whole window escalates", async () => {
    expect(await walk("a-baseline")).toBe(true);
  });

  test("a per-agent success through the SDK ends the episode, as cpFetch does", async () => {
    expect(await walk("a-1", WAKING_EPISODE_GAP_MS)).toBe(false);
  });

  test("a user-scoped path clears nothing — there is no agent in it", async () => {
    await viaSdk("/v1/preferences/timezone", async () => "ok");
    expect(await walk("a-2")).toBe(true);
  });
});

describe("the delegated timezone seed", () => {
  test("reads, then one create-only PUT, both pinned to the seed's space", async () => {
    stubFetch(() =>
      json(200, { value: calls.length === 1 ? null : "America/Bogota" }),
    );
    const c = client();
    // The person stands in another space: the seed still targets its own.
    c.setActiveOrg("ffffffffffffffff");

    const result = await c.seedTimezone(`org:${ORG}`, "America/Bogota");
    expect(result).toEqual({
      kind: "seeded",
      timezone: "America/Bogota",
      source: "detected",
    });
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ["GET", `${BASE}/v1/preferences/timezone`, null],
      [
        "PUT",
        `${BASE}/v1/preferences/timezone`,
        JSON.stringify({ value: "America/Bogota", onlyIfAbsent: true }),
      ],
    ]);
    for (const call of calls) {
      expect(call.headers.get("x-houston-org")).toBe(ORG);
      // A body flag, never a header the gateway's CORS allow-list lacks.
      expect(call.headers.get("If-None-Match")).toBeNull();
    }
  });

  test("a stored zone is adopted and nothing is written", async () => {
    stubFetch(() => json(200, { value: "Europe/Lisbon" }));
    const c = client();
    c.setActiveOrg(ORG);
    expect(await c.seedTimezone(`org:${ORG}`, "America/Bogota")).toEqual({
      kind: "stored",
      timezone: "Europe/Lisbon",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  });

  test("a choice landing between the read and the write answers 412 and wins", async () => {
    stubFetch(() =>
      calls.length === 1
        ? json(200, { value: null })
        : json(412, { code: "preference_exists", value: "Europe/Lisbon" }),
    );
    const c = client();
    c.setActiveOrg(ORG);
    expect(await c.seedTimezone(`org:${ORG}`, "America/Bogota")).toEqual({
      kind: "stored",
      timezone: "Europe/Lisbon",
    });
  });
});
