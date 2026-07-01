import { expect, test } from "vitest";
import { type ComposioLoginClient, ComposioProvider } from "./composio";
import type { ProviderCredential } from "./types";

/**
 * The Composio adapter verified against an injected fetch — no network. These
 * pin the REQUEST shaping (path, the x-user-api-key header, query/body) and the
 * wire→port MAPPING, so swapping the live transport later can't silently change
 * what the host sends or how it reads the reply.
 */

type Reply = { status?: number; body?: unknown };
interface Recorded {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(
  handler: (url: URL, method: string) => Reply,
  loginClient?: ComposioLoginClient,
) {
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
    baseURL: "https://cmp.test",
    webURL: "https://web.test",
    fetch: fetchImpl,
    loginClient,
  });
  return { provider, calls };
}

const cred: ProviderCredential = {
  provider: "composio",
  data: {
    apiKey: "uak_test",
    userId: "consumer-1",
    orgId: "ok_test",
    projectId: "pr_test",
  },
};

test("verifyCredential maps session/info and sends the user key", async () => {
  const { provider, calls } = harness((url) => {
    if (url.pathname === "/api/v3/auth/session/info") {
      return {
        body: { org_member: { user_id: "consumer-1", email: "a@b.com" } },
      };
    }
    return { status: 404 };
  });
  expect(await provider.verifyCredential(cred)).toEqual({
    accountId: "consumer-1",
    email: "a@b.com",
  });
  expect(calls[0]?.headers["x-user-api-key"]).toBe("uak_test");
  expect(calls[0]?.headers["x-org-id"]).toBe("ok_test");
});

test("verifyCredential returns null on 401 (bad key), throws on 500", async () => {
  const unauthorized = harness(() => ({ status: 401 }));
  expect(await unauthorized.provider.verifyCredential(cred)).toBeNull();

  const broken = harness(() => ({ status: 500, body: { error: "boom" } }));
  await expect(broken.provider.verifyCredential(cred)).rejects.toThrow(/→ 500/);
});

test("listToolkits maps the catalog", async () => {
  const { provider, calls } = harness((url) =>
    url.pathname === "/api/v3/toolkits"
      ? {
          body: {
            items: [
              {
                slug: "gmail",
                name: "Gmail",
                meta: { description: "Email", logo: "l.png" },
              },
            ],
          },
        }
      : { status: 404 },
  );
  const toolkits = await provider.listToolkits(cred);
  expect(toolkits).toEqual([
    {
      slug: "gmail",
      name: "Gmail",
      description: "Email",
      logoUrl: "l.png",
      categories: [],
    },
  ]);
  expect(calls[0]?.path).toContain("limit=1000");
});

test("listConnections reads connected_accounts, project-scoped (verified live)", async () => {
  const { provider, calls } = harness((url) =>
    url.pathname === "/api/v3/connected_accounts"
      ? {
          body: {
            items: [
              { toolkit: { slug: "gmail" }, id: "ca1", status: "ACTIVE" },
              { toolkit: { slug: "github" }, id: "ca2", status: "ACTIVE" },
            ],
          },
        }
      : { status: 404 },
  );
  const conns = await provider.listConnections(cred);
  expect(conns).toEqual([
    { toolkit: "gmail", connectionId: "ca1", status: "active" },
    { toolkit: "github", connectionId: "ca2", status: "active" },
  ]);
  expect(calls[0]?.path).toContain("user_ids=consumer-1");
  // The consumer-project header is what makes the connections visible at all.
  expect(calls[0]?.headers["x-project-id"]).toBe("pr_test");
});

test("execute posts user_id + arguments to the action path and maps the result", async () => {
  const { provider, calls } = harness((url, method) =>
    method === "POST" &&
    url.pathname === "/api/v3/tools/execute/GMAIL_SEND_EMAIL"
      ? { body: { successful: true, data: { id: "msg1" } } }
      : { status: 404 },
  );
  const result = await provider.execute(cred, "GMAIL_SEND_EMAIL", {
    to: "a@b.com",
    subject: "Hi",
  });
  expect(result).toEqual({
    successful: true,
    data: { id: "msg1" },
    error: undefined,
  });
  expect(calls[0]?.body).toEqual({
    user_id: "consumer-1",
    arguments: { to: "a@b.com", subject: "Hi" },
  });
  // The consumer-project header is REQUIRED for execute to find the connection.
  expect(calls[0]?.headers["x-project-id"]).toBe("pr_test");
});

test("disconnect deletes every connected account for the toolkit", async () => {
  const { provider, calls } = harness((url, method) => {
    if (method === "GET" && url.pathname === "/api/v3/connected_accounts") {
      return { body: { items: [{ id: "ca1" }, { id: "ca2" }] } };
    }
    if (method === "DELETE") return { status: 204 };
    return { status: 404 };
  });
  await provider.disconnect(cred, "gmail");
  const deletes = calls.filter((c) => c.method === "DELETE").map((c) => c.path);
  expect(deletes).toEqual([
    "/api/v3/connected_accounts/ca1",
    "/api/v3/connected_accounts/ca2",
  ]);
});

test("search maps discovered actions to slugs + param schemas", async () => {
  const { provider, calls } = harness((url) =>
    url.pathname === "/api/v3/tools"
      ? {
          body: {
            items: [
              {
                slug: "GMAIL_SEND_EMAIL",
                toolkit: { slug: "gmail" },
                description: "Send",
                input_parameters: { type: "object" },
              },
            ],
          },
        }
      : { status: 404 },
  );
  const matches = await provider.search(cred, "email");
  expect(matches).toEqual([
    {
      action: "GMAIL_SEND_EMAIL",
      toolkit: "gmail",
      description: "Send",
      inputParams: { type: "object" },
    },
  ]);
  expect(calls[0]?.path).toContain("search=email");
});

test("a credential for another provider, or missing apiKey, is rejected", async () => {
  const { provider } = harness(() => ({ status: 200, body: {} }));
  await expect(
    provider.execute(
      { provider: "other", data: { apiKey: "x", userId: "u" } },
      "A",
      {},
    ),
  ).rejects.toThrow(/not 'composio'/);
  await expect(
    provider.execute({ provider: "composio", data: { userId: "u" } }, "A", {}),
  ).rejects.toThrow(/missing 'apiKey'/);
});

test("startLogin mints a session and builds the no-key login URL", async () => {
  const loginClient: ComposioLoginClient = {
    createSession: async () => ({ id: "sess-1" }),
    getSession: async () => ({ status: "pending" }),
  };
  const { provider } = harness(() => ({ status: 200 }), loginClient);
  expect(await provider.startLogin()).toEqual({
    loginUrl: "https://web.test/?cliKey=sess-1",
    pollKey: "sess-1",
  });
});

test("pollLogin is pending until linked, then returns the credential (key never shown)", async () => {
  let linked = false;
  const loginClient: ComposioLoginClient = {
    createSession: async () => ({ id: "s" }),
    getSession: async () =>
      linked
        ? {
            status: "linked",
            api_key: "uak_new",
            account: { email: "x@y.com" },
          }
        : { status: "pending" },
  };
  const { provider, calls } = harness((url, method) => {
    if (url.pathname === "/api/v3/auth/session/info")
      return {
        body: {
          org_member: { email: "x@y.com" },
          project: { org: { id: "ok_1" } },
        },
      };
    if (
      method === "POST" &&
      url.pathname === "/api/v3/org/consumer/project/resolve"
    )
      return {
        body: {
          consumer_user_id: "consumer-1-ok_1",
          project_nano_id: "pr_abc",
        },
      };
    return { status: 404 };
  }, loginClient);

  expect(await provider.pollLogin("s")).toEqual({ status: "pending" });

  linked = true;
  expect(await provider.pollLogin("s")).toEqual({
    status: "linked",
    credential: {
      provider: "composio",
      data: {
        apiKey: "uak_new",
        orgId: "ok_1",
        userId: "consumer-1-ok_1",
        projectId: "pr_abc",
        email: "x@y.com",
      },
    },
  });
  // The consumer user id is resolved with the freshly-linked key + its org.
  const resolve = calls.find((c) =>
    c.path.startsWith("/api/v3/org/consumer/project/resolve"),
  );
  expect(resolve?.headers["x-user-api-key"]).toBe("uak_new");
  expect(resolve?.headers["x-org-id"]).toBe("ok_1");
});

test("connect deep-links to the provider's hosted connect (no key, no orchestration)", async () => {
  const { provider } = harness(() => ({ status: 200 }));
  const r = await provider.connect(cred, "gmail");
  // "Composio for you" hosts the connect UX in its dashboard; we just send the user.
  expect(r.redirectUrl).toBe("https://web.test/connections?add=gmail");
  expect(r.connectionId).toBe("");
});
