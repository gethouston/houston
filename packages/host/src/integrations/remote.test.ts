import { expect, test } from "vitest";
import { RemoteIntegrationProvider } from "./remote";
import { IntegrationSigninRequiredError } from "./types";

/**
 * The gateway adapter verified against an injected fetch: pins the upstream
 * paths/bodies, the Supabase bearer, and the signed-out behavior (not-ready +
 * typed signin-required error) — the desktop's custody guarantee that no
 * platform key exists on the machine.
 */

type Reply = { status?: number; body?: unknown };
interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(handler: (url: URL, method: string) => Reply, token?: string) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      url: String(input),
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = handler(url, method);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const provider = new RemoteIntegrationProvider({
    id: "composio",
    upstreamUrl: "https://cloud.test/",
    token: () => token ?? null,
    fetch: fetchImpl,
  });
  return { provider, calls };
}

test("signed out: not ready, and every call throws the typed signin error", async () => {
  const { provider, calls } = harness(() => ({ body: {} }));
  expect(await provider.readiness()).toEqual({
    ready: false,
    reason: "signin",
  });
  await expect(provider.listToolkits()).rejects.toThrow(
    IntegrationSigninRequiredError,
  );
  await expect(provider.execute("u", "X", {})).rejects.toThrow(
    IntegrationSigninRequiredError,
  );
  expect(calls).toEqual([]); // nothing ever left the machine
});

test("signed in: forwards to the upstream /v1/integrations routes with the bearer", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname.endsWith("/toolkits"))
      return { body: { items: [{ slug: "gmail", name: "Gmail" }] } };
    if (url.pathname.endsWith("/connections")) return { body: { items: [] } };
    if (url.pathname.endsWith("/connect"))
      return { body: { redirectUrl: "https://oauth", connectionId: "ca_1" } };
    if (url.pathname.endsWith("/connections/ca_1"))
      return {
        body: { toolkit: "gmail", connectionId: "ca_1", status: "active" },
      };
    if (url.pathname.endsWith("/search")) return { body: { items: [] } };
    if (url.pathname.endsWith("/execute"))
      return { body: { successful: true } };
    if (url.pathname.endsWith("/disconnect")) return { body: { ok: true } };
    return { status: 404 };
  }, "jwt-1");

  expect(await provider.readiness()).toEqual({ ready: true });
  expect(await provider.listToolkits()).toEqual([
    { slug: "gmail", name: "Gmail" },
  ]);
  expect(calls[0]?.url).toBe(
    "https://cloud.test/v1/integrations/composio/toolkits",
  );
  expect(calls[0]?.headers.authorization).toBe("Bearer jwt-1");

  // The userId params are ignored — the upstream derives identity from the JWT.
  await provider.listConnections("ignored");
  const start = await provider.connect("ignored", "gmail");
  expect(start).toEqual({ redirectUrl: "https://oauth", connectionId: "ca_1" });
  expect(calls[2]?.body).toEqual({ toolkit: "gmail" });

  expect(await provider.connection("ignored", "ca_1")).toMatchObject({
    status: "active",
  });
  await provider.search("ignored", "email");
  expect(calls[4]?.body).toEqual({ query: "email" });
  await provider.execute("ignored", "GMAIL_SEND_EMAIL", { to: "a@b" });
  expect(calls[5]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b" },
  });
  await provider.disconnect("ignored", "gmail");
  expect(calls[6]?.body).toEqual({ toolkit: "gmail" });
});

test("upstream 401 (expired session) becomes the typed signin error; 404 poll → null; 500 throws", async () => {
  const expired = harness(() => ({ status: 401 }), "stale-jwt");
  await expect(expired.provider.listToolkits()).rejects.toThrow(
    IntegrationSigninRequiredError,
  );

  const { provider } = harness((url) => {
    if (url.pathname.includes("/connections/gone")) return { status: 404 };
    return { status: 500, body: { error: "boom" } };
  }, "jwt-1");
  expect(await provider.connection("u", "gone")).toBeNull();
  await expect(provider.listToolkits()).rejects.toThrow(/→ 500/);
});
