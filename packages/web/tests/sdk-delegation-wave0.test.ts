import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  HoustonEngineError,
  isSignedOutEngineError,
} from "../src/engine-adapter/client/errors";
import {
  toHoustonEngineError,
  viaSdk,
} from "../src/engine-adapter/client/sdk-error";
import * as controlPlane from "../src/engine-adapter/control-plane";
import { HANDOFF_RETRY_DELAYS_MS } from "../src/engine-adapter/cp/unavailable-reason";
import {
  WAKING_EPISODE_GAP_MS,
  WAKING_STUCK_THRESHOLD_MS,
  wakingStuckTracker,
} from "../src/engine-adapter/waking-stuck-tracker";

/**
 * Migration wave 0 — the SDK transport becomes a strict superset of `cpFetch`,
 * so a READ may be delegated at all.
 *
 * `getPreference` is the proof: it was the one account-key call deliberately
 * held back, because `cpFetch` wraps GETs in the reason-aware read retry and
 * the SDK's fetch port did not. The port carries it now (`client/context.ts`),
 * and these tests pin both halves of that claim — the request the delegated
 * read issues, and the attempts a transient 503 earns it — against the
 * control-plane helper it replaced, in the same file, on the same stub.
 *
 * `client/sdk-error.ts` is the other half: the SDK's transports throw their own
 * error classes carrying a TEXT body, and the app catches `HoustonEngineError`.
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

/** Answer every request with `make()`, recording what was asked. */
function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    return make();
  }) as unknown as typeof fetch;
}

const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

    calls = [];
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

  test("percent-encodes the key into the path, as the helper did", async () => {
    stubFetch(() => json(200, { value: "1" }));
    await client().getPreference("legal_acceptance");
    expect(calls[0].url).toBe(`${BASE}/v1/preferences/legal_acceptance`);
  });

  test("a transient 503 earns the same attempts cpFetch would", async () => {
    // A 5xx body the gateway vocabulary does not recognise reads as the
    // `handoff` reason: two brief blind retries, three attempts in all.
    stubFetch(() => json(503, { error: "gateway rolling" }));

    await expect(client().getPreference("timezone")).rejects.toThrow();
    const delegated = calls.length;

    calls = [];
    await expect(
      controlPlane.getPreference({ baseUrl: BASE, token: "t" }, "timezone"),
    ).rejects.toThrow();

    expect(delegated).toBe(calls.length);
    expect(delegated).toBe(HANDOFF_RETRY_DELAYS_MS.length + 1);
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
