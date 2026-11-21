import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { afterEach, expect, test } from "vitest";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import { authPathIn, servedProvidersPathIn } from "./auth-file";
import {
  reportRevokedServedToken,
  resetRevokedReportsForTest,
} from "./report-revoked";
import { recordServedScope, resetServedScopes } from "./served-scope";

type Captured = { url: string; body: Record<string, unknown> } | null;

async function withServeMode(
  setup: (dataDir: string) => void,
  body: () => void,
  opts?: { serveMode?: boolean },
): Promise<Captured> {
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevDataDir = config.dataDir;
  const prevFetch = globalThis.fetch;
  let captured: Captured = null;

  config.controlPlaneUrl =
    opts?.serveMode === false ? "" : "http://control-plane.test";
  config.sandboxToken = opts?.serveMode === false ? "" : "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-revoked-"));
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured = {
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    return new Response(JSON.stringify({ ok: true, removed: true }), {
      status: 200,
    });
  }) as unknown as typeof globalThis.fetch;

  try {
    setup(config.dataDir);
    body();
    await new Promise((r) => setTimeout(r, 10));
    return captured;
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
}

function servedOauth(dataDir: string, provider: string, access: string): void {
  writeFileSync(
    join(dataDir, "auth.json"),
    JSON.stringify({
      [provider]: { type: "oauth", access, refresh: "", expires: 0 },
    }),
  );
  writeFileSync(
    join(dataDir, "served-providers.json"),
    JSON.stringify([provider]),
  );
}

function servedAnthropic(dataDir: string, access = "served-access"): void {
  servedOauth(dataDir, "anthropic", access);
}

function servedAnthropicFor(
  dataDir: string,
  scopeKey: string,
  access: string,
): void {
  const authPath = authPathIn(dataDir, scopeKey);
  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(
    authPath,
    JSON.stringify({
      anthropic: { type: "oauth", access, refresh: "", expires: 0 },
    }),
  );
  writeFileSync(
    servedProvidersPathIn(dataDir, scopeKey),
    JSON.stringify(["anthropic"]),
  );
}

function actingToken(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };

afterEach(() => {
  resetServedScopes();
  resetRevokedReportsForTest();
});

const revoked: ProviderError = {
  kind: "unauthenticated",
  provider: "anthropic",
  cause: "token_revoked",
  message: "401 OAuth access token has been revoked",
};

test("reports a revoked served token, naming it by digest only", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "the-revoked-token"),
    () => reportRevokedServedToken(revoked, accessDigest("the-revoked-token")),
  );

  expect(captured?.url).toBe(
    "http://control-plane.test/sandbox/credential/revoked",
  );
  expect(captured?.body.provider).toBe("anthropic");
  expect(captured?.body.accessSha256).toBe(accessDigest("the-revoked-token"));
  expect(JSON.stringify(captured?.body)).not.toContain("the-revoked-token");
});

test("names the token the FAILED turn ran on, not the healthier one stored since", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "fresh-healthy-token"),
    () => reportRevokedServedToken(revoked, accessDigest("the-dead-token")),
  );

  expect(captured?.body.accessSha256).toBe(accessDigest("the-dead-token"));
  expect(captured?.body.accessSha256).not.toBe(
    accessDigest("fresh-healthy-token"),
  );
});

test("an UNKNOWN at-failure token never reports — even with a token stored", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "fresh-healthy-token"),
    () => reportRevokedServedToken(revoked, undefined),
  );
  expect(captured).toBeNull();
});

test("still reports when the local entry is already gone (row may live centrally)", async () => {
  const captured = await withServeMode(
    (dir) => {
      writeFileSync(join(dir, "auth.json"), JSON.stringify({}));
      writeFileSync(
        join(dir, "served-providers.json"),
        JSON.stringify(["anthropic"]),
      );
    },
    () => reportRevokedServedToken(revoked, accessDigest("the-dead-token")),
  );
  expect(captured?.body.accessSha256).toBe(accessDigest("the-dead-token"));
});

test("a member's report names the acting identity, not just the scope", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropicFor(dir, "u:sub-alice", "alice-revoked-token"),
    () =>
      runWithActingContext(alice, () => {
        recordServedScope("anthropic", "personal");
        reportRevokedServedToken(revoked, accessDigest("alice-revoked-token"));
      }),
  );

  expect(captured?.body.actingAs).toBe(alice.actingAs);
  expect(captured?.body.scope).toBe("personal");
  expect(captured?.body.accessSha256).toBe(accessDigest("alice-revoked-token"));
});

test("a team report carries no acting identity at all", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () => reportRevokedServedToken(revoked, accessDigest("served-access")),
  );

  expect(captured?.body.scope).toBe("team");
  expect(Object.hasOwn(captured?.body ?? {}, "actingAs")).toBe(false);
});

test("does NOT report a non-terminal auth failure", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () =>
      reportRevokedServedToken(
        {
          ...revoked,
          cause: "invalid_api_key",
        } as ProviderError,
        accessDigest("served-access"),
      ),
  );
  expect(captured).toBeNull();
});

test.each([
  [
    "with Anthropic's own remedy prose",
    "Your organization has disabled Claude subscription access for Claude Code",
  ],
  ["even when the text carries a confirmed marker", "403 has been revoked"],
])("does NOT report an org_policy_blocked failure %s (PRODUCT-1393)", async (_label, message) => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () =>
      reportRevokedServedToken(
        { ...revoked, cause: "org_policy_blocked", message },
        accessDigest("served-access"),
      ),
  );
  expect(captured).toBeNull();
});

test.each([
  [
    "a session that merely 'ended'",
    "401 Your session has ended. Please log in again.",
  ],
  [
    "a bare re-login prompt",
    "401 Unauthorized. Please login again to continue.",
  ],
  ["prose about a terminated session", "401 Unauthorized: session terminated"],
])("does NOT report %s — loose copy, no confirmed revocation", async (_label, message) => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () =>
      reportRevokedServedToken(
        { ...revoked, message },
        accessDigest("served-access"),
      ),
  );
  expect(captured).toBeNull();
});

test.each([
  [
    "a negated revocation",
    "401 Unauthorized: the token was checked and has not been revoked",
  ],
  ["an unrelated field that merely spells it", '401 {"revoked_scopes":[]}'],
])("does NOT report %s — the marker must be anchored", async (_label, message) => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () =>
      reportRevokedServedToken(
        { ...revoked, message },
        accessDigest("served-access"),
      ),
  );
  expect(captured).toBeNull();
});

test.each([
  [
    "the provider stating it outright",
    '401 {"error":{"message":"OAuth access token has been revoked"}}',
  ],
  ["a structured revocation code", '401 {"error":{"code":"token_revoked"}}'],
  ["prose naming the access", "401 Unauthorized: access revoked by the admin"],
])("reports %s (anchored marker)", async (_label, message) => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "the-revoked-token"),
    () =>
      reportRevokedServedToken(
        { ...revoked, message },
        accessDigest("the-revoked-token"),
      ),
  );
  expect(captured?.body.accessSha256).toBe(accessDigest("the-revoked-token"));
});

test.each([
  [
    "Codex's structured session kill",
    "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
  ],
  [
    "OpenAI's invalidated refresh token",
    '401 {"error":{"code":"refresh_token_invalidated"}}',
  ],
])("reports %s", async (_label, message) => {
  const captured = await withServeMode(
    (dir) => servedOauth(dir, "openai-codex", "codex-revoked-token"),
    () =>
      reportRevokedServedToken(
        {
          ...revoked,
          provider: "openai-codex",
          message,
        },
        accessDigest("codex-revoked-token"),
      ),
  );

  expect(captured?.url).toBe(
    "http://control-plane.test/sandbox/credential/revoked",
  );
  expect(captured?.body.provider).toBe("openai-codex");
  expect(captured?.body.accessSha256).toBe(accessDigest("codex-revoked-token"));
});

test("does NOT report a credential this runtime owns locally", async () => {
  const captured = await withServeMode(
    (dir) => {
      writeFileSync(
        join(dir, "auth.json"),
        JSON.stringify({
          anthropic: { type: "oauth", access: "local-tok", refresh: "r" },
        }),
      );
      writeFileSync(join(dir, "served-providers.json"), JSON.stringify([]));
    },
    () => reportRevokedServedToken(revoked, accessDigest("local-tok")),
  );
  expect(captured).toBeNull();
});

test("does NOT report when serve mode is off", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () => reportRevokedServedToken(revoked, accessDigest("served-access")),
    { serveMode: false },
  );
  expect(captured).toBeNull();
});

test("an api_key credential records no used token, so no report can fire", async () => {
  const captured = await withServeMode(
    (dir) => {
      writeFileSync(
        join(dir, "auth.json"),
        JSON.stringify({ anthropic: { type: "api_key", key: "sk-1" } }),
      );
      writeFileSync(
        join(dir, "served-providers.json"),
        JSON.stringify(["anthropic"]),
      );
    },
    () => reportRevokedServedToken(revoked, undefined),
  );
  expect(captured).toBeNull();
});

test("the same dead token is reported once per pod lifetime (HOUSTON-APP-530)", async () => {
  const prevFetch = globalThis.fetch;
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevDataDir = config.dataDir;
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-revoked-dedupe-"));
  let reports = 0;
  globalThis.fetch = (async () => {
    reports += 1;
    return new Response(JSON.stringify({ ok: true, removed: true }), {
      status: 200,
    });
  }) as unknown as typeof globalThis.fetch;
  try {
    servedAnthropic(config.dataDir, "same-dead-token");
    reportRevokedServedToken(revoked, accessDigest("same-dead-token"));
    await new Promise((r) => setTimeout(r, 10));
    reportRevokedServedToken(revoked, accessDigest("same-dead-token"));
    await new Promise((r) => setTimeout(r, 10));
    expect(reports).toBe(1);

    servedAnthropic(config.dataDir, "next-dead-token");
    reportRevokedServedToken(revoked, accessDigest("next-dead-token"));
    await new Promise((r) => setTimeout(r, 10));
    expect(reports).toBe(2);
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
});

test("a failed report is not deduped — the next turn retries", async () => {
  const prevFetch = globalThis.fetch;
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevDataDir = config.dataDir;
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-revoked-retry-"));
  let reports = 0;
  globalThis.fetch = (async () => {
    reports += 1;
    if (reports === 1) throw new Error("gateway unreachable");
    return new Response(JSON.stringify({ ok: true, removed: true }), {
      status: 200,
    });
  }) as unknown as typeof globalThis.fetch;
  try {
    servedAnthropic(config.dataDir, "retry-dead-token");
    reportRevokedServedToken(revoked, accessDigest("retry-dead-token"));
    await new Promise((r) => setTimeout(r, 10));
    reportRevokedServedToken(revoked, accessDigest("retry-dead-token"));
    await new Promise((r) => setTimeout(r, 10));
    expect(reports).toBe(2);
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
});

test("a failing control plane never throws into the caller", async () => {
  const prevFetch = globalThis.fetch;
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevDataDir = config.dataDir;
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-revoked-boom-"));
  globalThis.fetch = (async () => {
    throw new Error("gateway unreachable");
  }) as unknown as typeof globalThis.fetch;
  try {
    servedAnthropic(config.dataDir);
    expect(() =>
      reportRevokedServedToken(revoked, accessDigest("served-access")),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
});
