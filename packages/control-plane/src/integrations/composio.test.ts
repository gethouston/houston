import { expect, test } from "bun:test";
import { ComposioProvider } from "./composio";
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
    baseURL: "https://cmp.test",
    fetch: fetchImpl,
  });
  return { provider, calls };
}

const cred: ProviderCredential = {
  provider: "composio",
  data: { apiKey: "uak_test", userId: "consumer-1", orgId: "ok_test" },
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

test("listConnections hits the consumer namespace with user_id (slug strings, verified live)", async () => {
  const { provider, calls } = harness((url) =>
    url.pathname === "/api/v3/org/consumer/connected_toolkits"
      ? { body: { toolkits: ["gmail", "github"] } } // real shape: array of slug strings
      : { status: 404 },
  );
  const conns = await provider.listConnections(cred);
  expect(conns).toEqual([
    { toolkit: "gmail", connectionId: "", status: "active" },
    { toolkit: "github", connectionId: "", status: "active" },
  ]);
  expect(calls[0]?.path).toContain("user_id=consumer-1");
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

test("login + connect fail loudly (slice b), never pretend to work", async () => {
  const { provider } = harness(() => ({ status: 200 }));
  await expect(provider.startLogin()).rejects.toThrow(/slice \(b\)/);
  await expect(provider.pollLogin("x")).rejects.toThrow(/slice \(b\)/);
  await expect(provider.connect(cred, "gmail")).rejects.toThrow(/slice \(b\)/);
});
