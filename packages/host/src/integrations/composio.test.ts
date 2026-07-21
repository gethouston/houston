import { expect, test } from "vitest";
import { ComposioProvider } from "./composio";
import { IntegrationUpstreamError } from "./types";

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
              // Composio's real shape: categories live under meta as {id,name},
              // the top-level `categories` is null. We key off the id.
              meta: {
                description: "Email",
                logo: "https://l/g.png",
                categories: [
                  { id: "developer-tools", name: "developer tools" },
                  { id: "email", name: "email" },
                ],
              },
              categories: null,
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
      categories: ["developer-tools", "email"],
    },
  ]);
  expect(calls[0]?.headers["x-api-key"]).toBe("pk_test");
  expect(calls[0]?.path).toBe("/api/v3/toolkits?limit=1000");
});

test("listToolkits drops no_auth toolkits — nothing to connect", async () => {
  // Composio's catalog includes toolkits with no auth at all (its own
  // meta-toolkit, hackernews…). A Connect button on those can only produce
  // the Auth_Config_NoAuthApp 400 seen in prod — they never enter the catalog.
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/toolkits") {
      return {
        body: {
          items: [
            { slug: "composio", name: "Composio", no_auth: true },
            { slug: "gmail", name: "Gmail" },
            { slug: "hackernews", name: "Hackernews", no_auth: true },
          ],
        },
      };
    }
    return { status: 404 };
  });
  expect((await provider.listToolkits()).map((t) => t.slug)).toEqual(["gmail"]);
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

test("connect skips bare custom OAuth and picks a user-collectible scheme (metaads)", async () => {
  // Meta Ads: no Composio-managed app, schemes [OAUTH2, API_KEY]. A custom
  // OAUTH2 config with empty credentials can never complete the dance (this
  // was the "can't connect Meta Ads" bug), so the fallback must skip OAuth
  // modes and land on API_KEY — the hosted connect page collects the token.
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/metaads") {
      return {
        body: {
          composio_managed_auth_schemes: [],
          auth_config_details: [{ mode: "OAUTH2" }, { mode: "API_KEY" }],
        },
      };
    }
    if (url.pathname === "/api/v3/auth_configs" && method === "POST") {
      return { body: { auth_config: { id: "ac_meta" } } };
    }
    if (url.pathname === "/api/v3.1/connected_accounts/link") {
      return {
        body: { redirect_url: "https://link", connected_account_id: "ca_3" },
      };
    }
    return { status: 404 };
  });

  const start = await provider.connect(USER, "metaads");
  expect(calls[2]?.body).toEqual({
    toolkit: { slug: "metaads" },
    auth_config: {
      type: "use_custom_auth",
      authScheme: "API_KEY",
      credentials: {},
    },
  });
  expect(start.connectionId).toBe("ca_3");
});

test("connect refuses an OAuth-only toolkit with no managed app, naming the remedy", async () => {
  // OAuth-only + unmanaged: nothing the user can self-serve. The error names
  // the operator remedy (register a dev OAuth app in the Composio dashboard —
  // resolveAuthConfig then reuses that config on the next connect).
  const { provider } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/oauthonly") {
      return {
        body: {
          composio_managed_auth_schemes: [],
          auth_config_details: [{ mode: "OAUTH2" }],
        },
      };
    }
    return { status: 404 };
  });
  await expect(provider.connect(USER, "oauthonly")).rejects.toThrow(
    /only offers OAuth.*Composio dashboard/,
  );
});

test("connect on a NO_AUTH toolkit is a clean 400, not a doomed Composio POST", async () => {
  // Prod repro (Sentry): connecting the "composio" meta-toolkit forwarded a
  // create-auth-config POST that Composio 400s (Auth_Config_NoAuthApp) and
  // the user saw an opaque 502. NO_AUTH must short-circuit before that POST
  // with a user-actionable error.
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth_configs" && method === "GET") {
      return { body: { items: [] } };
    }
    if (url.pathname === "/api/v3/toolkits/composio") {
      return {
        body: {
          composio_managed_auth_schemes: [],
          auth_config_details: [{ mode: "NO_AUTH" }],
        },
      };
    }
    return { status: 404 };
  });
  const failure = await provider.connect(USER, "composio").then(
    () => null,
    (err: unknown) => err,
  );
  expect(failure).toBeInstanceOf(IntegrationUpstreamError);
  expect((failure as IntegrationUpstreamError).status).toBe(400);
  expect((failure as IntegrationUpstreamError).body).toMatchObject({
    code: "toolkit_no_auth",
  });
  // The doomed create POST was never sent.
  expect(
    calls.some(
      (c) => c.method === "POST" && c.path.startsWith("/api/v3/auth_configs"),
    ),
  ).toBe(false);
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

test("connection FAILS CLOSED when Composio omits user_id — ownership unproven → null", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts/ca_anon") {
      // No top-level user_id at all: nothing proves this account is the
      // caller's, so the guard must not surface it.
      return {
        body: { id: "ca_anon", toolkit: { slug: "gmail" }, status: "ACTIVE" },
      };
    }
    if (url.pathname === "/api/v3/connected_accounts/ca_weird") {
      // A non-string user_id is equally unproven.
      return { body: { id: "ca_weird", user_id: 42, status: "ACTIVE" } };
    }
    return { status: 404 };
  });
  expect(await provider.connection(USER, "ca_anon")).toBeNull();
  expect(await provider.connection(USER, "ca_weird")).toBeNull();
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

test("search runs BOTH the scoped and global query, merges (scoped first, deduped), and stamps status", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return {
        body: {
          items: [{ toolkit: { slug: "gmail" }, id: "ca_1", status: "ACTIVE" }],
        },
      };
    if (url.pathname === "/api/v3/toolkits") return { body: { items: [] } };
    // Scoped (toolkit_slug=gmail) → the connected app's action; global (no
    // toolkit_slug) → a NEW app plus a DUPLICATE of the connected one.
    if (url.searchParams.has("toolkit_slug"))
      return {
        body: {
          items: [
            {
              slug: "GMAIL_SEND_EMAIL",
              toolkit: { slug: "gmail" },
              description: "Send an email",
            },
          ],
        },
      };
    return {
      body: {
        items: [
          {
            slug: "GMAIL_SEND_EMAIL",
            toolkit: { slug: "gmail" },
            description: "Send an email",
          },
          {
            slug: "GOOGLESHEETS_CREATE",
            toolkit: { slug: "googlesheets" },
            description: "Create a sheet",
          },
        ],
      },
    };
  });
  const found = await provider.search(USER, "send an email");
  // Scoped connected match first, then the global new app; the duplicate is
  // dropped, and every entry carries its status.
  expect(
    found.map((t) => [t.action, t.toolkit, t.connected, t.status]),
  ).toEqual([
    ["GMAIL_SEND_EMAIL", "gmail", true, "connected"],
    ["GOOGLESHEETS_CREATE", "googlesheets", false, "connectable"],
  ]);
});

test("a connected toolkit no longer short-circuits global discovery (the bug)", async () => {
  // A connected-Gmail user asks for Google Sheets. The scoped query returns a
  // (loose) Gmail match — the OLD code returned there and never ran global
  // discovery, so Sheets was undiscoverable. It must surface now.
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return {
        body: {
          items: [{ toolkit: { slug: "gmail" }, id: "ca_1", status: "ACTIVE" }],
        },
      };
    if (url.pathname === "/api/v3/toolkits") return { body: { items: [] } };
    if (url.searchParams.has("toolkit_slug"))
      return {
        body: {
          items: [
            {
              slug: "GMAIL_SEARCH_PEOPLE",
              toolkit: { slug: "gmail" },
              description: "unrelated but nonzero",
            },
          ],
        },
      };
    return {
      body: {
        items: [
          {
            slug: "GOOGLESHEETS_CREATE_SPREADSHEET",
            toolkit: { slug: "googlesheets" },
            description: "Create a spreadsheet",
          },
        ],
      },
    };
  });
  const found = await provider.search(USER, "google sheets");
  expect(found.find((t) => t.toolkit === "googlesheets")).toMatchObject({
    action: "GOOGLESHEETS_CREATE_SPREADSHEET",
    connected: false,
    status: "connectable",
  });
});

test("catalog resolution surfaces a connectable toolkit entry when no action scored", async () => {
  // Composio's action full-text search scores ~zero for a plain app name, so
  // the toolkits catalog resolves the name to a real slug the model can pass to
  // request_connection — as a toolkit-level entry (empty action).
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return { body: { items: [] } };
    if (url.pathname === "/api/v3/toolkits")
      return {
        body: {
          items: [
            {
              slug: "googlesheets",
              name: "Google Sheets",
              meta: { description: "Spreadsheets" },
            },
            { slug: "gmail", name: "Gmail" },
          ],
        },
      };
    return { body: { items: [] } }; // no action scored
  });
  const found = await provider.search(USER, "connect to google sheets");
  expect(found).toEqual([
    {
      action: "",
      toolkit: "googlesheets",
      description: "Google Sheets: Spreadsheets",
      connected: false,
      status: "connectable",
    },
  ]);
});

test("a resolved app the user already connected is a connected toolkit entry", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return {
        body: {
          items: [
            { toolkit: { slug: "googlesheets" }, id: "ca_1", status: "ACTIVE" },
          ],
        },
      };
    if (url.pathname === "/api/v3/toolkits")
      return {
        body: { items: [{ slug: "googlesheets", name: "Google Sheets" }] },
      };
    return { body: { items: [] } }; // no action scored, only the catalog entry
  });
  const found = await provider.search(USER, "google sheets");
  expect(found).toEqual([
    {
      action: "",
      toolkit: "googlesheets",
      description: "Google Sheets",
      connected: true,
      status: "connected",
    },
  ]);
});

test("the toolkits catalog is fetched once and cached across searches", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return { body: { items: [] } };
    if (url.pathname === "/api/v3/toolkits")
      return { body: { items: [{ slug: "notion", name: "Notion" }] } };
    return { body: { items: [] } };
  });
  await provider.search(USER, "notion");
  await provider.search(USER, "notion");
  expect(
    calls.filter((c) => c.path.startsWith("/api/v3/toolkits")).length,
  ).toBe(1);
});

test("a query naming no app and matching no action returns empty (genuinely unknown)", async () => {
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return { body: { items: [] } };
    if (url.pathname === "/api/v3/toolkits")
      return { body: { items: [{ slug: "gmail", name: "Gmail" }] } };
    return { body: { items: [] } };
  });
  expect(await provider.search(USER, "zzznope")).toEqual([]);
});

test("a zero-hit scoped query degrades to listing the connected toolkits' actions", async () => {
  // "read my latest 5 emails" scores zero against GMAIL_FETCH_EMAILS, so the
  // scoped retry (no query) surfaces the toolkit's real actions.
  const { provider } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return {
        body: { items: [{ toolkit: { slug: "gmail" }, status: "ACTIVE" }] },
      };
    if (url.pathname === "/api/v3/toolkits") return { body: { items: [] } };
    // Every query-bearing call misses; only the no-query listing returns actions.
    if (url.searchParams.has("query")) return { body: { items: [] } };
    return {
      body: {
        items: [
          {
            slug: "GMAIL_FETCH_EMAILS",
            toolkit: { slug: "gmail" },
            description: "Fetch emails",
          },
        ],
      },
    };
  });
  const found = await provider.search(USER, "read my latest 5 emails");
  expect(found.map((t) => t.action)).toEqual(["GMAIL_FETCH_EMAILS"]);
  expect(found[0]).toMatchObject({ connected: true, status: "connected" });
});

test("with nothing connected, global discovery marks matches connectable (HOU-670)", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/connected_accounts")
      return { body: { items: [] } };
    if (url.pathname === "/api/v3/toolkits") return { body: { items: [] } };
    return {
      body: {
        items: [
          {
            slug: "GMAIL_SEND_EMAIL",
            toolkit: { slug: "gmail" },
            description: "Send an email",
          },
        ],
      },
    };
  });
  const found = await provider.search(USER, "send an email");
  // Discoverable but connectable → the agent offers the card.
  expect(found.map((t) => [t.action, t.connected, t.status])).toEqual([
    ["GMAIL_SEND_EMAIL", false, "connectable"],
  ]);
  // No scoped query when nothing is connected — just the global one.
  expect(calls.some((c) => c.path.includes("toolkit_slug"))).toBe(false);
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
