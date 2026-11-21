import { expect, test } from "vitest";
import { RemoteIntegrationProvider } from "./remote";
import {
  IntegrationSigninRequiredError,
  IntegrationUpstreamError,
} from "./types";

type Reply = { status?: number; body?: unknown };
interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(
  handler: (url: URL, method: string) => Reply,
  token?: string,
  podToken?: string,
) {
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
    podToken,
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
  expect(calls).toEqual([]);
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

test("non-401 upstream errors carry status and body for route relay", async () => {
  const body = { error: "not granted", code: "integration_grant_required" };
  const { provider } = harness(() => ({ status: 403, body }), "jwt-1");

  await expect(provider.execute("u", "X", {})).rejects.toMatchObject({
    status: 403,
    body,
  });
  await expect(provider.execute("u", "X", {})).rejects.toThrow(
    IntegrationUpstreamError,
  );
});

test("acting mode a: an acting-as token authenticates AS that user (overrides the session)", async () => {
  const { provider, calls } = harness(
    () => ({ body: { items: [], successful: true } }),
    "session-jwt",
    "pod-secret",
  );
  await provider.search("owner", "email", { actingAs: "acting-v1.tok" });
  await provider.execute("owner", "X", {}, { actingAs: "acting-v1.tok" });
  expect(calls[0]?.headers.authorization).toBe("Bearer acting-v1.tok");
  expect(calls[0]?.headers["x-houston-acting-user"]).toBeUndefined();
  expect(calls[1]?.headers.authorization).toBe("Bearer acting-v1.tok");
});

test("acting mode b: a routine actingUser + pod token → pod bearer + acting-user header", async () => {
  const { provider, calls } = harness(
    () => ({ body: { items: [], successful: true } }),
    undefined,
    "pod-secret",
  );
  await provider.execute("owner", "X", {}, { actingUser: "sub-123" });
  expect(calls[0]?.headers.authorization).toBe("Bearer pod-secret");
  expect(calls[0]?.headers["x-houston-acting-user"]).toBe("sub-123");
});

test("search passes a valid upstream status through verbatim (incl. the future blocked)", async () => {
  const { provider } = harness(
    () => ({
      body: {
        items: [
          {
            action: "GMAIL_SEND_EMAIL",
            toolkit: "gmail",
            description: "Send",
            connected: true,
            status: "connected",
          },
          {
            action: "",
            toolkit: "salesforce",
            description: "Salesforce",
            connected: false,
            status: "blocked",
          },
        ],
      },
    }),
    "jwt-1",
  );
  expect(
    (await provider.search("u", "email")).items.map((m) => [
      m.toolkit,
      m.status,
    ]),
  ).toEqual([
    ["gmail", "connected"],
    ["salesforce", "blocked"],
  ]);
});

test("search derives status from `connected` when absent, and repairs an invalid one", async () => {
  const { provider } = harness(
    () => ({
      body: {
        items: [
          { action: "A", toolkit: "gmail", description: "", connected: true },
          { action: "B", toolkit: "slack", description: "", connected: false },
          {
            action: "C",
            toolkit: "notion",
            description: "",
            connected: false,
            status: "banana",
          },
        ],
      },
    }),
    "jwt-1",
  );
  expect(
    (await provider.search("u", "x")).items.map((m) => [m.toolkit, m.status]),
  ).toEqual([
    ["gmail", "connected"],
    ["slack", "connectable"],
    ["notion", "connectable"],
  ]);
});

test("acting mode c: no acting context falls back to the session token (else signin error)", async () => {
  const signedIn = harness(() => ({ body: { items: [] } }), "session-jwt");
  await signedIn.provider.search("owner", "email");
  expect(signedIn.calls[0]?.headers.authorization).toBe("Bearer session-jwt");
  expect(signedIn.calls[0]?.headers["x-houston-acting-user"]).toBeUndefined();

  const noPod = harness(() => ({ body: {} }));
  await expect(
    noPod.provider.execute("owner", "X", {}, { actingUser: "sub-123" }),
  ).rejects.toThrow(IntegrationSigninRequiredError);
  expect(noPod.calls).toEqual([]);
});

test("disconnect forwards the narrowing connectionId; omits it when absent", async () => {
  const { provider, calls } = harness(() => ({ body: { ok: true } }), "tok");
  await provider.disconnect("u", "gmail");
  expect(calls[0]?.body).toEqual({ toolkit: "gmail" });
  await provider.disconnect("u", "gmail", "ca_2");
  expect(calls[1]?.body).toEqual({ toolkit: "gmail", connectionId: "ca_2" });
});

test("search forwards the app scope; omits it when absent (PRODUCT-1274)", async () => {
  const { provider, calls } = harness(() => ({ body: { items: [] } }), "tok");
  await provider.search("u", "get top users");
  expect(calls[0]?.body).toEqual({ query: "get top users" });
  await provider.search("u", "get top users", undefined, "posthog");
  expect(calls[1]?.body).toEqual({ query: "get top users", app: "posthog" });
});

test("search maps the gateway's `scoped` echo onto the scope outcome", async () => {
  const yes = harness(() => ({ body: { items: [], scoped: true } }), "tok");
  expect(
    (await yes.provider.search("u", "q", undefined, "posthog")).scope,
  ).toBe("resolved");
  const no = harness(() => ({ body: { items: [], scoped: false } }), "tok");
  expect((await no.provider.search("u", "q", undefined, "posthog")).scope).toBe(
    "unresolved",
  );
});

test("an upstream that predates the scope contract reports scope IGNORED", async () => {
  const { provider } = harness(() => ({ body: { items: [] } }), "tok");
  expect((await provider.search("u", "q", undefined, "posthog")).scope).toBe(
    "ignored",
  );
  expect((await provider.search("u", "q")).scope).toBeUndefined();
});

test("execute forwards the target account; omits it when absent", async () => {
  const { provider, calls } = harness(
    () => ({ body: { successful: true } }),
    "tok",
  );
  await provider.execute("u", "GMAIL_SEND_EMAIL", { to: "x" });
  expect(calls[0]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "x" },
  });
  await provider.execute(
    "u",
    "GMAIL_SEND_EMAIL",
    { to: "x" },
    undefined,
    "ca_2",
  );
  expect(calls[1]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "x" },
    account: "ca_2",
  });
});

test("search passes account lists through untouched", async () => {
  const { provider } = harness(
    () => ({
      body: {
        items: [
          {
            action: "GMAIL_SEND_EMAIL",
            toolkit: "gmail",
            description: "Send",
            connected: true,
            status: "connected",
            accounts: [{ id: "ca_1", label: "dan@gmail.com" }, { id: "ca_2" }],
          },
        ],
      },
    }),
    "tok",
  );
  const { items } = await provider.search("u", "send email");
  expect(items[0]?.accounts).toEqual([
    { id: "ca_1", label: "dan@gmail.com" },
    { id: "ca_2" },
  ]);
});
