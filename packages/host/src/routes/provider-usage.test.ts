import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialVault } from "../ports";
import { handleSandboxProviderUsage } from "./provider-usage";

/**
 * The central Copilot quota probe: GitHub's quota endpoint authenticates with
 * the long-lived GitHub OAuth token, which only the host's central store holds
 * (the runtime's auth.json is scrubbed to access-only — Gate #2). The route
 * must relay the quota payload without ever leaking the token, answer the
 * marked 404 for a never-connected workspace, and map GitHub's auth rejection
 * to a 401 the runtime renders as "sign in again".
 */

const vault: CredentialVault = {
  sandboxToken: () => "sbx",
  validateSandboxToken: (t) =>
    t === "sbx" ? { workspaceId: "w1", agentId: "a1" } : null,
};

function mockReq(token = "sbx"): IncomingMessage {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as unknown as IncomingMessage;
}

function mockRes(): {
  res: ServerResponse;
  out: {
    status?: number;
    headers?: Record<string, string>;
    body: Record<string, unknown>;
  };
} {
  const out: {
    status?: number;
    headers?: Record<string, string>;
    body: Record<string, unknown>;
  } = { body: {} };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status;
      out.headers = headers;
    },
    end(buf: Buffer | string) {
      out.body = JSON.parse(buf.toString());
    },
  } as unknown as ServerResponse;
  return { res, out };
}

const call = (
  credentials: MemoryCredentialStore,
  out: ReturnType<typeof mockRes>,
  opts: {
    provider?: string;
    token?: string;
    fetchImpl?: typeof fetch;
  } = {},
) =>
  handleSandboxProviderUsage(
    { vault, credentials, fetchImpl: opts.fetchImpl },
    "GET",
    "/sandbox/provider-usage",
    new URL(
      `http://x/sandbox/provider-usage?provider=${opts.provider ?? "github-copilot"}`,
    ),
    mockReq(opts.token),
    out.res,
  );

async function connectedStore(): Promise<MemoryCredentialStore> {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "github-copilot",
    accessToken: "copilot-session",
    refreshToken: "gh-token",
    expiresAt: Date.now() + 60_000,
    kind: "oauth",
  });
  return credentials;
}

test("relays GitHub's quota payload, authenticating with the central token", async () => {
  const credentials = await connectedStore();
  let url = "";
  let auth = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    url = String(input);
    auth = (init?.headers as Record<string, string>).Authorization ?? "";
    return new Response(
      JSON.stringify({ copilot_plan: "pro", quota_snapshots: {} }),
      { status: 200 },
    );
  };
  const r = mockRes();
  expect(await call(credentials, r, { fetchImpl })).toBe(true);
  expect(url).toBe("https://api.github.com/copilot_internal/user");
  expect(auth).toBe("token gh-token");
  expect(r.out.status).toBe(200);
  expect(r.out.body).toEqual({ copilot_plan: "pro", quota_snapshots: {} });
});

test("targets the enterprise host when the credential pins a domain", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "github-copilot",
    accessToken: "copilot-session",
    refreshToken: "gh-token",
    expiresAt: Date.now() + 60_000,
    kind: "oauth",
    enterpriseUrl: "acme.ghe.com",
  });
  let url = "";
  const fetchImpl: typeof fetch = async (input) => {
    url = String(input);
    return new Response("{}", { status: 200 });
  };
  const r = mockRes();
  expect(await call(credentials, r, { fetchImpl })).toBe(true);
  expect(url).toBe("https://api.acme.ghe.com/copilot_internal/user");
});

test("marked 404 when the workspace never connected Copilot", async () => {
  const r = mockRes();
  expect(await call(new MemoryCredentialStore(), r)).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("GitHub's 401/403 relays as our 401 (runtime → sign in again)", async () => {
  const credentials = await connectedStore();
  const r = mockRes();
  expect(
    await call(credentials, r, {
      fetchImpl: async () => new Response("{}", { status: 403 }),
    }),
  ).toBe(true);
  expect(r.out.status).toBe(401);
});

test("any other upstream failure answers 502 with the reason", async () => {
  const credentials = await connectedStore();
  const r = mockRes();
  expect(
    await call(credentials, r, {
      fetchImpl: async () => new Response("oops", { status: 500 }),
    }),
  ).toBe(true);
  expect(r.out.status).toBe(502);
  expect(r.out.body.error).toContain("500");

  const r2 = mockRes();
  expect(
    await call(credentials, r2, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    }),
  ).toBe(true);
  expect(r2.out.status).toBe(502);
  expect(r2.out.body.error).toBe("network down");
});

test("rejects a bad sandbox token and a provider with no central probe", async () => {
  const credentials = await connectedStore();
  const r = mockRes();
  expect(await call(credentials, r, { token: "wrong" })).toBe(true);
  expect(r.out.status).toBe(401);

  const r2 = mockRes();
  expect(await call(credentials, r2, { provider: "openai-codex" })).toBe(true);
  expect(r2.out.status).toBe(400);
});
