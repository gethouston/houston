import { expect, test } from "vitest";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { RemoteCredentialStore, scopeKeyOf } from "./remote-store";
import { RevocationTombstones } from "./revocation-tombstones";

type FetchCall = { url: string; init?: RequestInit };

const ORG = "0011223344556677";
const AGENT = "8899aabbccddeeff";
const BASE = "https://gateway.test";
const PATH = `${BASE}/v1/pod/credentials/${ORG}/${AGENT}/openai-codex`;

function gatewayCredential(over: Record<string, unknown> = {}) {
  return {
    provider: "openai-codex",
    kind: "oauth",
    access: "AT-central",
    expires: 1_730_000_000_000,
    accountId: null,
    enterpriseUrl: null,
    ...over,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fakeFetch(
  handler: (call: FetchCall, index: number) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return await handler(call, calls.length - 1);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function store(
  fetchImpl: typeof fetch,
  fallback?: CredentialStore,
  revocations?: RevocationTombstones,
) {
  return new RemoteCredentialStore({
    baseUrl: `${BASE}/`,
    orgSlug: ORG,
    agentSlug: AGENT,
    podToken: "pod-token",
    fallback,
    fetchImpl,
    revocations: revocations ?? new RevocationTombstones(),
  });
}

function headers(call: FetchCall): Record<string, string> {
  return call.init?.headers as Record<string, string>;
}

function requestBody(call: FetchCall): Record<string, unknown> {
  if (typeof call.init?.body !== "string")
    throw new Error("expected string request body");
  return JSON.parse(call.init.body) as Record<string, unknown>;
}

function actingAs(sub = "member-1"): string {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;
}

test("get maps a 200 gateway credential and strips refresh", async () => {
  const { calls, fetchImpl } = fakeFetch((call) => {
    expect(call.url).toBe(PATH);
    expect(headers(call).Authorization).toBe("Bearer pod-token");
    return json(
      gatewayCredential({
        accountId: "acct-1",
        enterpriseUrl: "acme.ghe.com",
      }),
    );
  });

  const got = await store(fetchImpl).get("ws_9", "openai-codex");

  expect(calls).toHaveLength(1);
  expect(got).toEqual({
    workspaceId: "ws_9",
    provider: "openai-codex",
    kind: "oauth",
    accessToken: "AT-central",
    refreshToken: "",
    expiresAt: 1_730_000_000_000,
    accountId: "acct-1",
    enterpriseUrl: "acme.ghe.com",
    scope: "team",
  });
});

test("404 means not connected and is cached as a negative result", async () => {
  const { calls, fetchImpl } = fakeFetch(() =>
    json({ error: "org not connected" }, 404),
  );
  const s = store(fetchImpl);

  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(await s.get("ws_2", "openai-codex")).toBeNull();
  expect(calls).toHaveLength(1);
});

test("invalidate sheds a cached negative so the next get sees a reconnect (PRODUCT-1515)", async () => {
  // A reconnect capture lands centrally without passing through this process,
  // so only an explicit invalidate can make the post-reconnect retry see it
  // inside the 15s cache window.
  const { calls, fetchImpl } = fakeFetch((_call, index) =>
    index === 0
      ? json({ error: "org not connected" }, 404)
      : json(gatewayCredential()),
  );
  const s = store(fetchImpl);

  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  s.invalidate("openai-codex");
  const got = await s.get("ws_1", "openai-codex");
  expect(got?.accessToken).toBe("AT-central");
  expect(calls).toHaveLength(2);
});

test("invalidate is scoped to the acting identity", async () => {
  const { calls, fetchImpl } = fakeFetch(() =>
    json({ error: "org not connected" }, 404),
  );
  const s = store(fetchImpl);
  const acting = { actingAs: actingAs() };

  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(await s.get("ws_1", "openai-codex", acting)).toBeNull();
  // Invalidating the member's row leaves the team's cached answer in place.
  s.invalidate("openai-codex", acting);
  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(await s.get("ws_1", "openai-codex", acting)).toBeNull();
  expect(calls).toHaveLength(3);
});

test("404 adopts a legacy fallback credential with insert-only PUT, then re-gets the winner", async () => {
  const legacy: WorkspaceCredential = {
    workspaceId: "ws_1",
    provider: "openai-codex",
    kind: "oauth",
    accessToken: "AT-legacy",
    refreshToken: "RT-legacy",
    expiresAt: 123,
    accountId: "acct-old",
  };
  const fallback: CredentialStore = {
    get: async () => legacy,
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch((call, index) => {
    if (index === 0) return json({ error: "org not connected" }, 404);
    if (index === 1) {
      expect(call.init?.method).toBe("PUT");
      expect(headers(call)["x-houston-if-absent"]).toBe("1");
      expect(requestBody(call)).toMatchObject({
        kind: "oauth",
        access: "AT-legacy",
        refresh: "RT-legacy",
        expires: 123,
        accountId: "acct-old",
      });
      return json({ ok: true });
    }
    return json(gatewayCredential({ access: "AT-winner" }));
  });

  const got = await store(fetchImpl, fallback).get("ws_1", "openai-codex");

  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
    "GET",
    "PUT",
    "GET",
  ]);
  expect(got?.accessToken).toBe("AT-winner");
  expect(got?.refreshToken).toBe("");
});

test("404 never adopts the fallback while a revocation tombstone is active (HOUSTON-APP-530)", async () => {
  const legacy: WorkspaceCredential = {
    workspaceId: "ws_1",
    provider: "openai-codex",
    kind: "oauth",
    accessToken: "AT-legacy",
    refreshToken: "RT-legacy",
    expiresAt: 123,
  };
  const fallback: CredentialStore = {
    get: async () => legacy,
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch(() =>
    json({ error: "org not connected" }, 404),
  );
  const revocations = new RevocationTombstones();
  // The gateway row is absent BECAUSE the provider revoked the credential;
  // the legacy file copy is the same dead family and must stay un-adopted.
  revocations.mark({
    workspaceId: "ws_1",
    provider: "openai-codex",
    scope: "team",
  });

  const got = await store(fetchImpl, fallback, revocations).get(
    "ws_1",
    "openai-codex",
  );

  expect(got).toBeNull();
  // One GET, no insert-only PUT: the dead credential was not resurrected.
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["GET"]);
});

test("transport errors throw and are not cached", async () => {
  let fail = true;
  const { calls, fetchImpl } = fakeFetch(() => {
    if (fail) {
      fail = false;
      throw new Error("gateway down");
    }
    return json(gatewayCredential({ access: "AT-after-retry" }));
  });
  const s = store(fetchImpl);

  await expect(s.get("ws_1", "openai-codex")).rejects.toThrow("gateway down");
  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe(
    "AT-after-retry",
  );
  expect(calls).toHaveLength(2);
});

test("positive cache absorbs repeated gets within the TTL", async () => {
  const { calls, fetchImpl } = fakeFetch(() =>
    json(gatewayCredential({ access: "AT-cached" })),
  );
  const s = store(fetchImpl);

  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("AT-cached");
  expect((await s.get("ws_2", "openai-codex"))?.workspaceId).toBe("ws_2");
  expect(calls).toHaveLength(1);
});

test("cache is isolated between the team and each acting user", async () => {
  let calls = 0;
  const { fetchImpl } = fakeFetch(() =>
    json(gatewayCredential({ access: `AT-${++calls}` })),
  );
  const s = store(fetchImpl);

  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("AT-1");
  expect(
    (await s.get("ws_1", "openai-codex", { actingAs: actingAs("a") }))
      ?.accessToken,
  ).toBe("AT-2");
  expect(
    (await s.get("ws_1", "openai-codex", { actingAs: actingAs("b") }))
      ?.accessToken,
  ).toBe("AT-3");
});

test("a personal get never adopts the legacy fallback", async () => {
  const fallback: CredentialStore = {
    get: async () => ({
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "AT-legacy",
      refreshToken: "RT-legacy",
      expiresAt: 123,
    }),
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch(() =>
    json({ error: "personal credential not connected" }, 404),
  );

  expect(
    await store(fetchImpl, fallback).get("ws_1", "openai-codex", {
      actingAs: actingAs(),
    }),
  ).toBeNull();
  expect(calls).toHaveLength(1);
  expect(calls[0]?.init?.method).toBeUndefined();
});

test("forwards the acting header on GET, PUT, and DELETE", async () => {
  const token = actingAs();
  const { calls, fetchImpl } = fakeFetch((call) => {
    if (call.init?.method === "PUT" || call.init?.method === "DELETE")
      return json({ ok: true });
    return json(gatewayCredential());
  });
  const s = store(fetchImpl);
  const acting = { actingAs: token };

  await s.get("ws_1", "openai-codex", acting);
  await s.put(
    {
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: 123,
    },
    acting,
  );
  await s.remove("ws_1", "openai-codex", acting);
  expect(calls).toHaveLength(3);
  for (const call of calls)
    expect(headers(call)["x-houston-acting-as"]).toBe(token);
});

test("put with ifAbsent sends the gateway's fill-only header (HOU-855)", async () => {
  const { calls, fetchImpl } = fakeFetch((call) => {
    if (call.init?.method === "PUT") {
      expect(headers(call)["x-houston-if-absent"]).toBe("1");
      return json({ ok: true });
    }
    return json(gatewayCredential({ access: "AT" }));
  });
  const s = store(fetchImpl);

  await s.put(
    {
      workspaceId: "ws_1",
      provider: "openai-codex",
      kind: "oauth",
      accessToken: "AT-local",
      refreshToken: "RT-local",
      expiresAt: 456,
    },
    { ifAbsent: true },
  );
  expect(calls.some((c) => c.init?.method === "PUT")).toBe(true);
});

test("put writes the gateway row and invalidates the provider cache", async () => {
  let getCount = 0;
  const { calls, fetchImpl } = fakeFetch((call) => {
    if (call.init?.method === "PUT") {
      expect(headers(call)["x-houston-if-absent"]).toBeUndefined();
      expect(requestBody(call)).toMatchObject({
        kind: "oauth",
        access: "AT-local",
        refresh: "RT-local",
        expires: 456,
      });
      return json({ ok: true });
    }
    getCount++;
    return json(
      gatewayCredential({
        access: getCount === 1 ? "AT-before" : "AT-after",
      }),
    );
  });
  const s = store(fetchImpl);

  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("AT-before");
  await s.put({
    workspaceId: "ws_1",
    provider: "openai-codex",
    accessToken: "AT-local",
    refreshToken: "RT-local",
    expiresAt: 456,
  });
  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("AT-after");
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
    "GET",
    "PUT",
    "GET",
  ]);
});

test("a 404 without the gateway error body is a transport error, not a logout", async () => {
  // Deploy skew: a gateway build without the /v1/pod/credentials route (or a
  // mistyped HOUSTON_CREDENTIALS_URL) answers a route-level 404 with no JSON
  // error body. That must throw, not read as "org signed out".
  let skewed = true;
  const { calls, fetchImpl } = fakeFetch(() => {
    if (skewed)
      return new Response("<html>route not found</html>", { status: 404 });
    return json(gatewayCredential({ access: "AT-after-fix" }));
  });
  const s = store(fetchImpl);

  await expect(s.get("ws_1", "openai-codex")).rejects.toThrow("failed (404)");
  skewed = false;
  // The skewed 404 was not negative-cached: the next get succeeds immediately.
  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe(
    "AT-after-fix",
  );
  expect(calls).toHaveLength(2);
});

test("a gateway dead-credential 502 is classified for serve recovery", async () => {
  const { fetchImpl } = fakeFetch(() =>
    json({ error: "credential refresh rejected: session ended" }, 502),
  );
  await expect(store(fetchImpl).get("ws_1", "openai-codex")).rejects.toThrow(
    "reported a dead credential",
  );
});

test("remove treats the gateway's not-connected 404 as already signed out and clears the fallback", async () => {
  let fallbackCred: WorkspaceCredential | null = {
    workspaceId: "ws_1",
    provider: "openai-codex",
    kind: "oauth",
    accessToken: "AT-legacy",
    refreshToken: "RT-legacy",
    expiresAt: 123,
  };
  const fallback: CredentialStore = {
    get: async () => fallbackCred,
    put: async () => {},
    remove: async () => {
      fallbackCred = null;
    },
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch(() =>
    json({ error: "org not connected" }, 404),
  );
  const s = store(fetchImpl, fallback);

  // Idempotent: another pod already deleted the row; sign-out still succeeds.
  await s.remove("ws_1", "openai-codex");
  expect(fallbackCred).toBeNull();
  // And the logout sticks: no gateway row, no fallback left to re-adopt.
  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["DELETE", "GET"]);
});

test("logout cannot resurrect through the legacy fallback after remove", async () => {
  let fallbackCred: WorkspaceCredential | null = {
    workspaceId: "ws_1",
    provider: "openai-codex",
    kind: "oauth",
    accessToken: "AT-legacy",
    refreshToken: "RT-legacy",
    expiresAt: 123,
  };
  const fallback: CredentialStore = {
    get: async () => fallbackCred,
    put: async () => {},
    remove: async () => {
      fallbackCred = null;
    },
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch((call) => {
    if (call.init?.method === "DELETE") return json({ ok: true });
    if (call.init?.method === "PUT")
      throw new Error("unexpected re-adoption PUT after logout");
    return json({ error: "org not connected" }, 404);
  });
  const s = store(fetchImpl, fallback);

  await s.remove("ws_1", "openai-codex");
  // The next get must NOT re-adopt the removed credential into the gateway.
  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["DELETE", "GET"]);
});

test("remove deletes remotely and invalidates the provider cache", async () => {
  const { calls, fetchImpl } = fakeFetch((call, index) => {
    if (index === 0) return json(gatewayCredential());
    if (index === 1) {
      expect(call.init?.method).toBe("DELETE");
      expect(headers(call).Authorization).toBe("Bearer pod-token");
      return json({ ok: true });
    }
    return json({ error: "org not connected" }, 404);
  });
  const s = store(fetchImpl);

  expect(await s.get("ws_1", "openai-codex")).not.toBeNull();
  await s.remove("ws_1", "openai-codex");
  expect(await s.get("ws_1", "openai-codex")).toBeNull();
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
    "GET",
    "DELETE",
    "GET",
  ]);
});

test("a personal revoked-token report says both WHICH row and WHOSE", async () => {
  // The gateway keys personal credentials by (org, user, provider): the scope
  // header alone leaves it unable to pick a row, so it refuses and the revoked
  // token keeps 401ing that member's turns (HOU-952/HOU-976).
  const token = actingAs("member-1");
  const { calls, fetchImpl } = fakeFetch(() => json({ removed: true }));

  expect(
    await store(fetchImpl).removeIfAccess("ws_1", "openai-codex", "sha-1", {
      scope: "personal",
      actingAs: token,
    }),
  ).toBe(true);

  expect(calls[0]?.init?.method).toBe("DELETE");
  expect(headers(calls[0] as FetchCall)).toMatchObject({
    Authorization: "Bearer pod-token",
    "x-houston-acting-as": token,
    "x-houston-credential-scope": "personal",
    "x-houston-if-access-sha256": "sha-1",
  });
});

test("a member's revoked-token report evicts only that member's cache entry", async () => {
  let served = 0;
  const { calls, fetchImpl } = fakeFetch((call) => {
    if (call.init?.method === "DELETE") return json({ removed: true });
    return json(gatewayCredential({ access: `AT-${++served}` }));
  });
  const s = store(fetchImpl);
  const alice = { actingAs: actingAs("alice") };
  const bob = { actingAs: actingAs("bob") };

  expect((await s.get("ws_1", "openai-codex", alice))?.accessToken).toBe(
    "AT-1",
  );
  expect((await s.get("ws_1", "openai-codex", bob))?.accessToken).toBe("AT-2");
  await s.removeIfAccess("ws_1", "openai-codex", "sha-1", {
    scope: "personal",
    ...alice,
  });

  // Bob's credential is untouched by Alice's report: still cached, no refetch.
  expect((await s.get("ws_1", "openai-codex", bob))?.accessToken).toBe("AT-2");
  // Alice's is gone, so hers is re-resolved from the gateway.
  expect((await s.get("ws_1", "openai-codex", alice))?.accessToken).toBe(
    "AT-3",
  );
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
    "GET",
    "GET",
    "DELETE",
    "GET",
  ]);
});

test("a cache key never embeds the acting token itself", async () => {
  // The same rule as the runtime's credentialScopeKeyFor: these keys reach log
  // lines and diagnostics, so an unreadable token is named by digest.
  const unreadable = [
    "no-payload-segment",
    `header.${Buffer.from(JSON.stringify({ sub: 7 })).toString("base64url")}.sig`,
    "header.!!not-base64-json!!.sig",
  ];

  const keys = unreadable.map((token) =>
    scopeKeyOf({ actingAs: token }, "openai-codex"),
  );
  for (const [i, key] of keys.entries())
    expect(key).not.toContain(unreadable[i]);
  // Isolation is unchanged: distinct unreadable tokens keep distinct scopes.
  expect(new Set(keys).size).toBe(unreadable.length);
});

// --- Dead google "API keys" (HOU-1107 / Sentry HOUSTON-APP-567) ---

const GOOGLE_PATH = `${BASE}/v1/pod/credentials/${ORG}/${AGENT}/google`;

test("a legacy dead google key is never adopted — dropped from the fallback instead", async () => {
  // The resurrection loop behind HOUSTON-APP-567: the serve guard deletes the
  // central row, then the next 404-adoption re-seeds it from a pod's disk.
  const removed: string[] = [];
  const fallback: CredentialStore = {
    get: async () => ({
      workspaceId: "ws_1",
      provider: "google",
      kind: "api_key",
      accessToken: "ya29.a0LegacyOAuthToken",
      refreshToken: "",
      expiresAt: 0,
    }),
    put: async () => {},
    remove: async (_ws, provider) => {
      removed.push(provider);
    },
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch((call) => {
    expect(call.url).toBe(GOOGLE_PATH);
    return json({ error: "org not connected" }, 404);
  });

  expect(await store(fetchImpl, fallback).get("ws_1", "google")).toBeNull();

  // One GET, no PUT: the dead row never reaches the gateway again.
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["GET"]);
  expect(removed).toEqual(["google"]);
});

test("put refuses a google credential that is not an API key", async () => {
  const { calls, fetchImpl } = fakeFetch(() => json({ ok: true }));
  await expect(
    store(fetchImpl).put({
      workspaceId: "ws_1",
      provider: "google",
      kind: "api_key",
      accessToken: "eyJhbGciOiJSUzI1NiJ9.payload.sig",
      refreshToken: "",
      expiresAt: 0,
    }),
  ).rejects.toThrow(/not an API key/);
  expect(calls).toHaveLength(0);
});

test("a real AIza google key still adopts and stores normally", async () => {
  const fallback: CredentialStore = {
    get: async () => ({
      workspaceId: "ws_1",
      provider: "google",
      kind: "api_key",
      accessToken: "AIzaSyRealKey",
      refreshToken: "",
      expiresAt: 0,
    }),
    put: async () => {},
    remove: async () => {
      throw new Error("must not remove a live key");
    },
    removeIfAccess: async () => false,
  };
  const { calls, fetchImpl } = fakeFetch((call, index) => {
    if (index === 0) return json({ error: "org not connected" }, 404);
    if (index === 1) {
      expect(call.init?.method).toBe("PUT");
      expect(requestBody(call)).toMatchObject({
        kind: "api_key",
        access: "AIzaSyRealKey",
      });
      return json({ ok: true });
    }
    return json(
      gatewayCredential({
        provider: "google",
        kind: "api_key",
        access: "AIzaSyRealKey",
        expires: 0,
      }),
    );
  });

  const got = await store(fetchImpl, fallback).get("ws_1", "google");
  expect(got?.accessToken).toBe("AIzaSyRealKey");
  expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
    "GET",
    "PUT",
    "GET",
  ]);
});
