import { expect, test } from "vitest";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { RemoteCredentialStore } from "./remote-store";

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

function store(fetchImpl: typeof fetch, fallback?: CredentialStore) {
  return new RemoteCredentialStore({
    baseUrl: `${BASE}/`,
    orgSlug: ORG,
    agentSlug: AGENT,
    podToken: "pod-token",
    fallback,
    fetchImpl,
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
