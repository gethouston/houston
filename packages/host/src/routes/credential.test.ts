import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialVault } from "../ports";
import { handleSandboxCredential } from "./credential";

/**
 * The sandbox credential endpoint must keep serving a turn even when the stored
 * credential cannot be refreshed centrally (e.g. anthropic has no refresh config
 * yet, or a refresh is rejected). It serves the existing token best-effort
 * instead of 500-ing every turn — otherwise the runtime's multi-provider serve
 * loop spams 500s for a stale, unused credential (a leftover Claude login while
 * the agent runs OpenCode). API-key credentials are served as-is, never refreshed.
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
  out: { status?: number; body: ServedBody };
} {
  const out: { status?: number; body: ServedBody } = { body: {} };
  const res = {
    writeHead(status: number) {
      out.status = status;
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
) =>
  handleSandboxCredential(
    { vault, credentials },
    "GET",
    "/sandbox/credential",
    new URL(`http://x/sandbox/credential?provider=${provider}`),
    mockReq(),
    out.res,
  );

test("serves the existing token when refresh has no config (no 500)", async () => {
  const credentials = new MemoryCredentialStore();
  // An EXPIRING anthropic oauth credential — refreshCredential throws (no anthropic
  // refresh config). Before the fix this returned 500 on every serve.
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "stale-AT",
    refreshToken: "RT",
    expiresAt: 1, // long past → "expiring"
  });
  const r = mockRes();
  expect(await call(credentials, "anthropic", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body.provider).toBe("anthropic");
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

test("404 when the workspace has not connected the provider", async () => {
  const credentials = new MemoryCredentialStore();
  const r = mockRes();
  expect(await call(credentials, "anthropic", r)).toBe(true);
  expect(r.out.status).toBe(404);
});

test("serves an OpenCode Go turn the shared opencode.ai key (sibling fallback)", async () => {
  const credentials = new MemoryCredentialStore();
  // The user connected OpenCode Zen (`opencode`) only; Go shares the same key,
  // so a Go turn must still be served — relabeled to the gateway it runs on.
  await credentials.put({
    workspaceId: "w1",
    provider: "opencode",
    accessToken: "sk-shared",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  const r = mockRes();
  expect(await call(credentials, "opencode-go", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "opencode-go",
    access: "sk-shared",
    kind: "api_key",
  });
});
