import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";

/**
 * Migration wave A4 — the account family (the caller's own display profile and
 * personal API keys) moves to `sdk.account`, and `cp/me-profile.ts` +
 * `cp/api-keys.ts` are gone.
 *
 * What these tests pin is the wire: the delegated mixin method must issue the
 * request the control-plane helper issued, down to the URL, the method, the
 * body bytes and the auth/active-space headers — one request, never two. The
 * degradations stay adapter-side, so they are pinned here too: the profile read
 * swallows a 404 (the Settings section hides on a gateway that predates the
 * route), and NOTHING else does — a write that reported success on a host that
 * never stored it is a silent failure.
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

/** A hosted client with an active space pinned, as the app runs in cloud. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** Every header `cpFetch` stamped on an account call, on the delegated one. */
function expectGatewayHeaders(call: Call) {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}

const PROFILE = {
  displayName: "Ada",
  photoUrl: "https://p/1",
  custom: { displayName: true, photoUrl: false },
};

describe("the delegated profile read", () => {
  test("issues the GET the control-plane helper did", async () => {
    stubFetch(() => json(200, PROFILE));

    await expect(client().getMyProfile()).resolves.toEqual(PROFILE);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/v1/me/profile`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a 404 still hides the Settings profile section", async () => {
    stubFetch(() => json(404, { error: "not found" }));

    await expect(client().getMyProfile()).resolves.toBeNull();
  });

  test("every other failure still surfaces with the host's reason", async () => {
    stubFetch(() => json(500, { error: "profile exploded" }));

    const err = await client()
      .getMyProfile()
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("profile exploded (engine error 500)");
  });
});

describe("the delegated profile write", () => {
  test("PUTs exactly the keys the caller set, and nothing else", async () => {
    stubFetch(() => json(200, PROFILE));

    await client().setMyProfile({ displayName: "Ada" });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/v1/me/profile`);
    expect(calls[0].body).toBe(JSON.stringify({ displayName: "Ada" }));
    expectGatewayHeaders(calls[0]);
  });

  test("clearing a field sends null — not an omitted key", async () => {
    stubFetch(() => json(200, PROFILE));

    await client().setMyProfile({ photoUrl: null });

    expect(calls[0].body).toBe(JSON.stringify({ photoUrl: null }));
  });

  test("does NOT degrade on a 404 — a save nowhere is not a save", async () => {
    stubFetch(() => json(404, { error: "not found" }));

    await expect(client().setMyProfile({ displayName: "Ada" })).rejects.toThrow(
      HoustonEngineError,
    );
  });

  test("a rejected name reaches the caller as the host's 400", async () => {
    stubFetch(() => json(400, { error: "name too long" }));

    const err = await client()
      .setMyProfile({ displayName: "x".repeat(61) })
      .catch((e) => e);

    expect(err.status).toBe(400);
    expect(err.body).toEqual({ error: "name too long" });
  });
});

describe("the delegated API-key calls", () => {
  const KEY = {
    id: "k1",
    name: "ci",
    prefix: "hst_ab",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  test("the list unwraps `keys` off one GET /v1/keys", async () => {
    stubFetch(() => json(200, { keys: [KEY] }));

    await expect(client().listApiKeys()).resolves.toEqual([KEY]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/v1/keys`);
    expectGatewayHeaders(calls[0]);
  });

  test("minting posts the name and returns the one-time secret", async () => {
    stubFetch(() => json(200, { ...KEY, key: "hst_secret" }));

    await expect(client().createApiKey("ci")).resolves.toEqual({
      ...KEY,
      key: "hst_secret",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/keys`);
    expect(calls[0].body).toBe(JSON.stringify({ name: "ci" }));
    expectGatewayHeaders(calls[0]);
  });

  test("the key-limit 400 reaches the caller for its inline treatment", async () => {
    stubFetch(() => json(400, { code: "key_limit" }));

    const err = await client()
      .createApiKey("ci")
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.body).toEqual({ code: "key_limit" });
  });

  test("revoking splices the id into the path, percent-encoded", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().revokeApiKey("k 1/2");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/keys/k%201%2F2`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a revoke that did not happen is never reported as one", async () => {
    stubFetch(() => json(404, { error: "not found" }));

    await expect(client().revokeApiKey("k1")).rejects.toThrow(
      HoustonEngineError,
    );
  });
});

describe("off-cloud, where there is no account at all", () => {
  const solo = () => new HoustonClient({ baseUrl: BASE, token: "t" });

  test("the profile read is empty and the write refuses", async () => {
    await expect(solo().getMyProfile()).resolves.toBeNull();
    await expect(solo().setMyProfile({ displayName: "Ada" })).rejects.toThrow(
      "Editing your profile needs the hosted gateway.",
    );
  });

  test("every API-key call refuses — there is no public API", async () => {
    await expect(solo().listApiKeys()).rejects.toThrow(
      "API keys require the hosted gateway.",
    );
    await expect(solo().createApiKey("ci")).rejects.toThrow(
      "API keys require the hosted gateway.",
    );
    await expect(solo().revokeApiKey("k1")).rejects.toThrow(
      "API keys require the hosted gateway.",
    );
  });
});
