import { expect, test } from "vitest";
import { supportsCustom, supportsMcp } from "./provider";
import { RemoteIntegrationProvider } from "./remote";
import {
  IntegrationSigninRequiredError,
  IntegrationUpstreamError,
} from "./types";

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

function harness(
  handler: (url: URL, method: string) => Reply,
  token?: string,
  podToken?: string,
  opts: { id?: string; custom?: boolean; mcp?: boolean } = {},
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
    id: opts.id ?? "composio",
    upstreamUrl: "https://cloud.test/",
    token: () => token ?? null,
    podToken,
    custom: opts.custom,
    mcp: opts.mcp,
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
    if (url.pathname.endsWith("/rename")) return { body: { ok: true } };
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
  // disconnect + rename are PER ACCOUNT (connectionId), not per toolkit.
  await provider.disconnect("ignored", "ca_1");
  expect(calls[6]?.body).toEqual({ connectionId: "ca_1" });
  await provider.rename("ignored", "ca_1", "Work");
  expect(calls[7]?.url).toBe(
    "https://cloud.test/v1/integrations/composio/connections/ca_1/rename",
  );
  expect(calls[7]?.body).toEqual({ alias: "Work" });
});

test("execute forwards the pinned account; search relays the upstream accounts verbatim", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname.endsWith("/execute"))
      return { body: { successful: true } };
    if (url.pathname.endsWith("/search"))
      return {
        body: {
          items: [{ action: "GMAIL_SEND_EMAIL", toolkit: "gmail" }],
          accounts: [
            { toolkit: "gmail", connectionId: "ca_1", accountLabel: "Work" },
          ],
        },
      };
    return { status: 404 };
  }, "jwt-1");

  await provider.execute(
    "u",
    "GMAIL_SEND_EMAIL",
    { to: "a@b" },
    {
      account: "ca_work",
    },
  );
  expect(calls[0]?.body).toEqual({
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b" },
    account: "ca_work",
  });

  const result = await provider.search("u", "email");
  expect(result.accounts).toEqual([
    { toolkit: "gmail", connectionId: "ca_1", accountLabel: "Work" },
  ]);
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

// ── Custom (per-user API-key) integrations: create/update forwarding ─────────

test("a custom adapter supportsCustom and forwards create → /custom/create, unwrapping {connection}", async () => {
  const connection = {
    toolkit: "acme",
    connectionId: "acme",
    status: "active" as const,
    accountLabel: "Acme",
  };
  const { provider, calls } = harness(
    () => ({ body: { connection } }),
    "jwt-1",
    undefined,
    {
      id: "custom",
      custom: true,
    },
  );
  expect(supportsCustom(provider)).toBe(true);
  if (!supportsCustom(provider)) throw new Error("unreachable");

  const config = {
    name: "Acme",
    baseUrl: "https://api.acme.test",
    auth: {
      type: "header" as const,
      header: "Authorization",
      prefix: "Bearer ",
    },
    description: "Acme CRM",
    apiKey: "sk-secret",
  };
  expect(await provider.createCustom("ignored", config)).toEqual(connection);
  expect(calls[0]?.url).toBe(
    "https://cloud.test/v1/integrations/custom/create",
  );
  expect(calls[0]?.method).toBe("POST");
  expect(calls[0]?.headers.authorization).toBe("Bearer jwt-1");
  expect(calls[0]?.body).toEqual(config); // the sealed key is forwarded, mode 1
});

test("a custom adapter forwards update with the connectionId + patch (omitted key kept upstream)", async () => {
  const connection = {
    toolkit: "acme",
    connectionId: "acme",
    status: "active" as const,
  };
  const { provider, calls } = harness(
    () => ({ body: { connection } }),
    "jwt-1",
    undefined,
    {
      id: "custom",
      custom: true,
    },
  );
  if (!supportsCustom(provider)) throw new Error("expected custom support");
  await provider.updateCustom("ignored", "acme", { description: "new" });
  expect(calls[0]?.url).toBe(
    "https://cloud.test/v1/integrations/custom/update",
  );
  expect(calls[0]?.body).toEqual({ connectionId: "acme", description: "new" });
});

test("a plain (composio) adapter does NOT support custom create/update", () => {
  const { provider } = harness(() => ({ body: {} }), "jwt-1");
  expect(supportsCustom(provider)).toBe(false);
});

// ── MCP server integrations: create/update forwarding ────────────────────────

test("an mcp adapter supportsMcp and forwards create → /mcp/create, unwrapping {connection}", async () => {
  const connection = {
    toolkit: "acme_tracker",
    connectionId: "acme_tracker",
    status: "active" as const,
    accountLabel: "Acme Tracker",
  };
  const { provider, calls } = harness(
    () => ({ body: { connection } }),
    "jwt-1",
    undefined,
    { id: "mcp", mcp: true },
  );
  // supportsMcp true, and it does NOT masquerade as a custom provider.
  expect(supportsMcp(provider)).toBe(true);
  expect(supportsCustom(provider)).toBe(false);
  if (!supportsMcp(provider)) throw new Error("unreachable");

  const config = {
    name: "Acme Tracker",
    url: "https://mcp.acme.test",
    auth: { type: "bearer" as const },
    description: "Acme issue tracker",
    authValue: "sk-secret",
  };
  expect(await provider.createMcpServer("ignored", config)).toEqual(connection);
  expect(calls[0]?.url).toBe("https://cloud.test/v1/integrations/mcp/create");
  expect(calls[0]?.method).toBe("POST");
  expect(calls[0]?.headers.authorization).toBe("Bearer jwt-1");
  expect(calls[0]?.body).toEqual(config); // the sealed secret is forwarded, mode 1
});

test("an mcp adapter forwards update with the connectionId + patch (omitted secret kept)", async () => {
  const connection = {
    toolkit: "acme_tracker",
    connectionId: "acme_tracker",
    status: "active" as const,
  };
  const { provider, calls } = harness(
    () => ({ body: { connection } }),
    "jwt-1",
    undefined,
    { id: "mcp", mcp: true },
  );
  if (!supportsMcp(provider)) throw new Error("expected mcp support");
  await provider.updateMcpServer("ignored", "acme_tracker", {
    description: "new",
  });
  expect(calls[0]?.url).toBe("https://cloud.test/v1/integrations/mcp/update");
  expect(calls[0]?.body).toEqual({
    connectionId: "acme_tracker",
    description: "new",
  });
});

test("a plain (composio) adapter does NOT support mcp create/update", () => {
  const { provider } = harness(() => ({ body: {} }), "jwt-1");
  expect(supportsMcp(provider)).toBe(false);
});

// ── Acting-as (C2): the three per-call auth modes on search/execute ───────────

test("acting mode a: an acting-as token authenticates AS that user (overrides the session)", async () => {
  // A frontend session AND a pod token are present — the acting-as token still
  // wins (precedence a), so a prompt-injected agent can only act as the driver.
  const { provider, calls } = harness(
    () => ({ body: { items: [], successful: true } }),
    "session-jwt",
    "pod-secret",
  );
  await provider.search("owner", "email", { actingAs: "acting-v1.tok" });
  await provider.execute(
    "owner",
    "X",
    {},
    {
      acting: { actingAs: "acting-v1.tok" },
    },
  );
  expect(calls[0]?.headers.authorization).toBe("Bearer acting-v1.tok");
  expect(calls[0]?.headers["x-houston-acting-user"]).toBeUndefined();
  expect(calls[1]?.headers.authorization).toBe("Bearer acting-v1.tok");
});

test("acting mode b: a routine actingUser + pod token → pod bearer + acting-user header", async () => {
  const { provider, calls } = harness(
    () => ({ body: { items: [], successful: true } }),
    undefined, // signed out on the frontend session — irrelevant to the routine path
    "pod-secret",
  );
  await provider.execute(
    "owner",
    "X",
    {},
    {
      acting: { actingUser: "sub-123" },
    },
  );
  expect(calls[0]?.headers.authorization).toBe("Bearer pod-secret");
  expect(calls[0]?.headers["x-houston-acting-user"]).toBe("sub-123");
});

test("acting mode c: no acting context falls back to the session token (else signin error)", async () => {
  const signedIn = harness(() => ({ body: { items: [] } }), "session-jwt");
  await signedIn.provider.search("owner", "email");
  expect(signedIn.calls[0]?.headers.authorization).toBe("Bearer session-jwt");
  expect(signedIn.calls[0]?.headers["x-houston-acting-user"]).toBeUndefined();

  // actingUser present but NO pod token configured (the desktop): mode b can't
  // apply, and with no session it falls through to the typed signin error —
  // nothing ever leaves the machine unauthenticated.
  const noPod = harness(() => ({ body: {} }));
  await expect(
    noPod.provider.execute(
      "owner",
      "X",
      {},
      {
        acting: { actingUser: "sub-123" },
      },
    ),
  ).rejects.toThrow(IntegrationSigninRequiredError);
  expect(noPod.calls).toEqual([]);
});
