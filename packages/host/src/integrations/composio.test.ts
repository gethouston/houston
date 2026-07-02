import { expect, test } from "vitest";
import { ComposioProvider } from "./composio";

/**
 * The Composio adapter verified against an injected fetch — no network. These
 * pin the REQUEST shaping (path, the x-api-key platform header, query/body) and
 * the wire→port MAPPING, so swapping the live transport later can't silently
 * change what the host sends or how it reads the reply.
 */

type Reply = { status?: number; body?: unknown };
interface Recorded {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(handler: (url: URL, method: string) => Reply) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname + url.search, method, headers, body });
    const r = handler(url, method);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const provider = new ComposioProvider({
    apiKey: "pk_test",
    baseURL: "https://cmp.test",
    callbackUrl: "https://gethouston.ai/connected",
    fetch: fetchImpl,
  });
  return { provider, calls };
}

const USER = "supabase-sub-1";

test("a missing platform key is a wiring bug, not a silent no-op", () => {
  expect(() => new ComposioProvider({ apiKey: "" })).toThrow(/api key/);
});

test("readiness is always ready (the key is here)", async () => {
  const { provider } = harness(() => ({ body: {} }));
  expect(await provider.readiness()).toEqual({ ready: true });
});

test("listToolkits maps the catalog and sends the platform key", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/toolkits") {
      return {
        body: {
          items: [
            {
              slug: "gmail",
              name: "Gmail",
              meta: { description: "Email", logo: "https://l/g.png" },
              categories: [{ name: "productivity" }, "email"],
            },
          ],
        },
      };
    }
    return { status: 404 };
  });
  expect(await provider.listToolkits()).toEqual([
    {
      slug: "gmail",
      name: "Gmail",
      description: "Email",
      logoUrl: "https://l/g.png",
      categories: ["productivity", "email"],
    },
  ]);
  expect(calls[0]?.headers["x-api-key"]).toBe("pk_test");
  expect(calls[0]?.path).toBe("/api/v3/toolkits?limit=1000");
});

test("listConnections scopes by user_ids and maps statuses", async () => {
  const { provider, calls } = harness(() => ({
    body: {
      items: [
        { toolkit: { slug: "gmail" }, id: "ca_1", status: "ACTIVE" },
        { toolkit: { slug: "slack" }, id: "ca_2", status: "INITIATED" },
        { toolkit: { slug: "notion" }, id: "ca_3", status: "REVOKED" },
      ],
    },
  }));
  expect(await provider.listConnections(USER)).toEqual([
    { toolkit: "gmail", connectionId: "ca_1", status: "active" },
    { toolkit: "slack", connectionId: "ca_2", status: "pending" },
    { toolkit: "notion", connectionId: "ca_3", status: "error" },
  ]);
  expect(calls[0]?.path).toBe(
    `/api/v3/connected_accounts?user_ids=${USER}&limit=100`,
  );
});

test("connect reuses the project's enabled auth config and mints a link session", async () => {
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return {
        body: {
          items: [
            { id: "ac_old", status: "DISABLED" },
            { id: "ac_gmail", status: "ENABLED" },
          ],
        },
      };
    }
    if (url.pathname === "/api/v3.1/connected_accounts/link") {
      return {
        body: {
          redirect_url: "https://oauth.g/consent",
          connected_account_id: "ca_9",
        },
      };
    }
    return { status: 404 };
  });

  const start = await provider.connect(USER, "gmail");
  expect(start).toEqual({
    redirectUrl: "https://oauth.g/consent",
    connectionId: "ca_9",
  });
  expect(calls[0]?.path).toBe(
    "/api/v3/auth_configs?toolkit_slug=gmail&limit=100",
  );
  expect(calls[1]?.method).toBe("POST");
  expect(calls[1]?.body).toEqual({
    auth_config_id: "ac_gmail",
    user_id: USER,
    callback_url: "https://gethouston.ai/connected",
  });

  // The auth config is cached — a second connect goes straight to the link.
  await provider.connect(USER, "gmail");
  expect(calls[2]?.path).toBe("/api/v3.1/connected_accounts/link");
});

test("connect creates a Composio-managed auth config when the toolkit has one", async () => {
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/slack") {
      return {
        body: {
          composio_managed_auth_schemes: ["OAUTH2"],
          auth_config_details: [{ mode: "OAUTH2" }],
        },
      };
    }
    if (url.pathname === "/api/v3/auth_configs" && method === "POST") {
      return { body: { auth_config: { id: "ac_new" } } };
    }
    if (url.pathname === "/api/v3.1/connected_accounts/link") {
      return {
        body: { redirect_url: "https://oauth", connected_account_id: "ca_1" },
      };
    }
    return { status: 404 };
  });

  await provider.connect(USER, "slack");
  expect(calls[2]?.body).toEqual({
    toolkit: { slug: "slack" },
    auth_config: { type: "use_composio_managed_auth" },
  });
  expect(calls[3]?.body).toMatchObject({ auth_config_id: "ac_new" });
});

test("connect falls back to the toolkit's own scheme when Composio has no managed auth", async () => {
  // API-key toolkits (serpapi, exa, firecrawl…): the auth config is created on
  // the toolkit's scheme with EMPTY credentials — the hosted connect link asks
  // the USER for their key. Verified live: use_composio_managed_auth 400s for
  // these, and this shape mints a working link session.
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/serpapi") {
      return {
        body: {
          composio_managed_auth_schemes: [],
          auth_config_details: [{ mode: "API_KEY" }],
        },
      };
    }
    if (url.pathname === "/api/v3/auth_configs" && method === "POST") {
      return { body: { auth_config: { id: "ac_key" } } };
    }
    if (url.pathname === "/api/v3.1/connected_accounts/link") {
      return {
        body: { redirect_url: "https://link", connected_account_id: "ca_2" },
      };
    }
    return { status: 404 };
  });

  const start = await provider.connect(USER, "serpapi");
  expect(calls[2]?.body).toEqual({
    toolkit: { slug: "serpapi" },
    auth_config: {
      type: "use_custom_auth",
      authScheme: "API_KEY",
      credentials: {},
    },
  });
  expect(start.connectionId).toBe("ca_2");
});

test("connect refuses a toolkit with no connectable auth scheme, loudly", async () => {
  const { provider } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/weird") {
      return {
        body: { composio_managed_auth_schemes: [], auth_config_details: [] },
      };
    }
    return { status: 404 };
  });
  await expect(provider.connect(USER, "weird")).rejects.toThrow(
    /no connectable auth scheme/,
  );
});

test("connection polls one account; 404 → null; another user's account → null", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts/ca_mine") {
      return {
        body: {
          id: "ca_mine",
          user_id: USER,
          toolkit: { slug: "gmail" },
          status: "ACTIVE",
        },
      };
    }
    if (url.pathname === "/api/v3/connected_accounts/ca_theirs") {
      return {
        body: { id: "ca_theirs", user_id: "someone-else", status: "ACTIVE" },
      };
    }
    return { status: 404 };
  });
  expect(await provider.connection(USER, "ca_mine")).toEqual({
    toolkit: "gmail",
    connectionId: "ca_mine",
    status: "active",
  });
  expect(await provider.connection(USER, "ca_theirs")).toBeNull();
  expect(await provider.connection(USER, "ca_gone")).toBeNull();
});

test("disconnect deletes every connected account for the toolkit", async () => {
  const deleted: string[] = [];
  const { provider } = harness((url, method) => {
    if (url.pathname === "/api/v3/connected_accounts" && method === "GET") {
      return { body: { items: [{ id: "ca_1" }, { id: "ca_2" }] } };
    }
    if (method === "DELETE") {
      deleted.push(url.pathname);
      return { status: 204 };
    }
    return { status: 404 };
  });
  await provider.disconnect(USER, "gmail");
  expect(deleted).toEqual([
    "/api/v3/connected_accounts/ca_1",
    "/api/v3/connected_accounts/ca_2",
  ]);
});

test("search scopes to the user's connected toolkits and maps tools", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts") {
      return {
        body: {
          items: [
            { toolkit: { slug: "gmail" }, id: "ca_1", status: "ACTIVE" },
            { toolkit: { slug: "slack" }, id: "ca_2", status: "ACTIVE" },
            // A second gmail account (dedup) and a failed one (excluded).
            { toolkit: { slug: "gmail" }, id: "ca_3", status: "ACTIVE" },
            { toolkit: { slug: "notion" }, id: "ca_4", status: "FAILED" },
          ],
        },
      };
    }
    return {
      body: {
        items: [
          {
            slug: "GMAIL_SEND_EMAIL",
            toolkit: { slug: "gmail" },
            description: "Send an email",
            input_parameters: { type: "object" },
          },
        ],
      },
    };
  });
  expect(await provider.search(USER, "send an email")).toEqual([
    {
      action: "GMAIL_SEND_EMAIL",
      toolkit: "gmail",
      description: "Send an email",
      inputParams: { type: "object" },
    },
  ]);
  // Scoped to the ACTIVE connected toolkits (deduped) — Composio's global
  // full-text search ranks unrelated tools above the obvious match.
  expect(calls[1]?.path).toBe(
    "/api/v3/tools?query=send+an+email&limit=10&toolkit_slug=gmail%2Cslack",
  );
});

test("search falls back to the global catalog when nothing is connected", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return { body: { items: [] } };
    return { body: { items: [] } };
  });
  expect(await provider.search(USER, "send an email")).toEqual([]);
  expect(calls[1]?.path).toBe("/api/v3/tools?query=send+an+email&limit=10");
});

test("execute posts user_id + arguments and maps success and failure", async () => {
  const ok = harness(() => ({
    body: { successful: true, data: { id: "msg_1" } },
  }));
  const result = await ok.provider.execute(USER, "GMAIL_SEND_EMAIL", {
    to: "a@b.com",
  });
  expect(result).toEqual({
    successful: true,
    data: { id: "msg_1" },
    error: undefined,
  });
  expect(ok.calls[0]?.path).toBe("/api/v3/tools/execute/GMAIL_SEND_EMAIL");
  expect(ok.calls[0]?.body).toEqual({
    user_id: USER,
    arguments: { to: "a@b.com" },
  });

  const failed = harness(() => ({
    body: { successful: false, error: "no connected account found" },
  }));
  expect(await failed.provider.execute(USER, "X", {})).toEqual({
    successful: false,
    data: undefined,
    error: "no connected account found",
  });
});

test("a non-2xx response surfaces as an error with the status + detail", async () => {
  const { provider } = harness(() => ({
    status: 500,
    body: { error: "boom" },
  }));
  await expect(provider.listToolkits()).rejects.toThrow(/→ 500.*boom/);
});
