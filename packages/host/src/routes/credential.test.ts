import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialVault } from "../ports";
import { handleSandboxCredential } from "./credential";

/**
 * The sandbox credential endpoint must keep serving a turn even when the stored
 * credential cannot be refreshed centrally (a refresh is rejected, or the
 * provider has no refresh config). It serves the existing token best-effort
 * instead of 500-ing every turn — otherwise the runtime's multi-provider serve
 * loop spams 500s for a stale, unused credential. API-key credentials are
 * served as-is, never refreshed.
 *
 * Anthropic is special-cased twice:
 *  - it serves ONLY on a gateway-fronted (managed cloud) host — a desktop/
 *    self-host store may hold a pushed-credential durability marker whose
 *    served token would SHADOW the working local keychain credential inside
 *    the Claude Agent SDK (CLAUDE_CODE_OAUTH_TOKEN outranks the config dir);
 *  - a STALE anthropic token is never served best-effort, for the same
 *    shadowing reason — the marked 404 lets the runtime fall back to the
 *    materialized-file path instead.
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

type ServedBody = {
  provider?: string;
  access?: string;
  expires?: number;
  accountId?: string | null;
  kind?: string;
  error?: string;
};

function mockRes(): {
  res: ServerResponse;
  out: { status?: number; headers?: Record<string, string>; body: ServedBody };
} {
  const out: {
    status?: number;
    headers?: Record<string, string>;
    body: ServedBody;
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
  provider: string,
  out: ReturnType<typeof mockRes>,
  opts: { gatewayFronted?: boolean } = {},
) =>
  handleSandboxCredential(
    { vault, credentials, gatewayFronted: opts.gatewayFronted },
    "GET",
    "/sandbox/credential",
    new URL(`http://x/sandbox/credential?provider=${provider}`),
    mockReq(),
    out.res,
  );

/** A far-future expiry: not "expiring" for any test run. */
const FRESH_EXPIRES = Date.now() + 60 * 60 * 1000;

test("serves the existing token when refresh has no config (no 500)", async () => {
  const credentials = new MemoryCredentialStore();
  // An EXPIRING oauth credential for a provider without a central refresh
  // config — refreshCredential throws. Before the fix this returned 500 on
  // every serve.
  await credentials.put({
    workspaceId: "w1",
    provider: "kimi-coding",
    accessToken: "stale-AT",
    refreshToken: "RT",
    expiresAt: 1, // long past → "expiring"
  });
  const r = mockRes();
  expect(await call(credentials, "kimi-coding", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body.provider).toBe("kimi-coding");
  expect(r.out.body.access).toBe("stale-AT"); // existing token served, not a 500
  expect(r.out.body.kind).toBe("oauth");
});

test("serves an api-key credential as kind=api_key without refreshing", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "opencode-go",
    accessToken: "sk-go",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  const r = mockRes();
  expect(await call(credentials, "opencode-go", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "opencode-go",
    access: "sk-go",
    kind: "api_key",
  });
});

test("serves a gateway access-only OAuth credential without local refresh", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "served-AT",
    refreshToken: "",
    expiresAt: 1, // expiring, but the gateway is the only refresher
    kind: "oauth",
  });
  const r = mockRes();
  expect(await call(credentials, "openai-codex", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "openai-codex",
    access: "served-AT",
    kind: "oauth",
  });
});

test("404 when the workspace has not connected the provider", async () => {
  const credentials = new MemoryCredentialStore();
  const r = mockRes();
  expect(await call(credentials, "openai-codex", r)).toBe(true);
  expect(r.out.status).toBe(404);
  // The authoritative marker: the runtime only drops served credentials on
  // marked 404s, never on a bare route-level 404.
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("anthropic is NOT served off the managed cloud, even when stored", async () => {
  // A desktop/self-host store can hold the durability marker written when a
  // credential was pushed to a pod. Serving it locally would shadow the
  // working keychain credential — the marked 404 keeps the local flow intact.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-marker",
    refreshToken: "RT",
    expiresAt: FRESH_EXPIRES,
  });
  const r = mockRes();
  expect(await call(credentials, "anthropic", r)).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("anthropic serves access-only on a gateway-fronted host", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-fresh",
    refreshToken: "", // gateway serves access-only; refresh never reaches pods
    expiresAt: FRESH_EXPIRES,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "anthropic",
    access: "sk-ant-oat01-fresh",
    kind: "oauth",
  });
});

test("a STALE anthropic token is never served (marked 404 instead)", async () => {
  // A stale served token would outrank the pod's materialized file inside the
  // SDK; degrading to not-connected lets the file path keep working.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-stale",
    refreshToken: "", // access-only AND expired: the gateway could not refresh
    expiresAt: 1,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("an expiring anthropic credential whose refresh fails degrades to marked 404", async () => {
  // refreshCredential throws for anthropic (no TS refresh config — the Go
  // gateway refreshes upstream). The stale guard must catch the still-expiring
  // credential instead of best-effort-serving it.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-stale",
    refreshToken: "RT",
    expiresAt: 1,
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});
