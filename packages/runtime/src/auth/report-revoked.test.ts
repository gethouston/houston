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

/**
 * The reporter is a DELETE trigger for a workspace-wide credential, so the
 * gating is the safety-critical part: every test here is about what must NOT
 * produce a report (HOU-952).
 *
 * The digest argument is the caller's capture of the token the FAILED turn ran
 * on (auth/used-token.ts, PRODUCT-1319) — the reporter never derives it from
 * auth.json, whose content at report time may already be a healthy
 * replacement.
 */

type Captured = { url: string; body: Record<string, unknown> } | null;

/** Serve mode + a data dir, with fetch captured. Returns what was reported. */
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
    // The reporter is fire-and-forget; let its microtasks drain.
    await new Promise((r) => setTimeout(r, 10));
    return captured;
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
}

/** A served oauth credential on disk, as a serve sync would leave it. */
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

/** The common case: anthropic, the provider most turns run on. */
function servedAnthropic(dataDir: string, access = "served-access"): void {
  servedOauth(dataDir, "anthropic", access);
}

/** The same, but in ONE member's files — where a per-identity serve sync lands. */
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
  // The token itself must never leave the runtime.
  expect(JSON.stringify(captured?.body)).not.toContain("the-revoked-token");
});

/**
 * PRODUCT-1319 — the bug this parameter exists to fix. The failed turn ran on
 * token A; a serve sync (or the user's reconnect) stored healthy token B
 * between the 401 and the report. Re-reading auth.json here digested B, and
 * the gateway's compare-and-delete then destroyed the FRESH credential,
 * potentially feeding a reconnect loop. The report must name A.
 */
test("names the token the FAILED turn ran on, not the healthier one stored since", async () => {
  const captured = await withServeMode(
    // A re-serve already replaced the dead token in auth.json…
    (dir) => servedAnthropic(dir, "fresh-healthy-token"),
    // …but the turn that 401'd ran on the old one, and says so.
    () => reportRevokedServedToken(revoked, accessDigest("the-dead-token")),
  );

  expect(captured?.body.accessSha256).toBe(accessDigest("the-dead-token"));
  expect(captured?.body.accessSha256).not.toBe(
    accessDigest("fresh-healthy-token"),
  );
});

test("an UNKNOWN at-failure token never reports — even with a token stored", async () => {
  // The caller could not capture what the failed turn ran on (it threw before
  // any request resolved a credential). Falling back to the file would aim the
  // delete at an unverified target — possibly a fresh reconnect — so the safe
  // move is to skip: a missed report costs a retry on the next failed turn, a
  // false one signs the workspace out of a working credential (PRODUCT-1319).
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "fresh-healthy-token"),
    () => reportRevokedServedToken(revoked, undefined),
  );
  expect(captured).toBeNull();
});

test("still reports when the local entry is already gone (row may live centrally)", async () => {
  // A local disconnect can race the report; the central store may still hold
  // (and keep serving) the dead row. The failed token is known and confirmed
  // revoked, and the gateway's compare-and-delete no-ops unless its row
  // matches — so the report goes out.
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
  // Without the acting token the gateway cannot tell WHICH member's row a
  // personal digest-delete targets, so it answers 400 and the dead token
  // survives — the whole HOU-952 failure this path exists to end.
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
  // Desktop, self-host and every pre-HOU-976 turn: the body stays exactly what
  // it was, so an older control plane sees no new field.
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () => reportRevokedServedToken(revoked, accessDigest("served-access")),
  );

  expect(captured?.body.scope).toBe("team");
  expect(Object.hasOwn(captured?.body ?? {}, "actingAs")).toBe(false);
});

test("does NOT report a non-terminal auth failure", async () => {
  // `unauthenticated` at large covers transient provider blips and bad keys.
  // Reporting those would delete a credential that is fine.
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
    "a session that merely 'ended'",
    "401 Your session has ended. Please log in again.",
  ],
  [
    "a bare re-login prompt",
    "401 Unauthorized. Please login again to continue.",
  ],
  ["prose about a terminated session", "401 Unauthorized: session terminated"],
])("does NOT report %s — loose copy, no confirmed revocation", async (_label, message) => {
  // These phrasings legitimately produce the `token_revoked` CARD (both
  // classifiers map them), but providers also reach for them on transient
  // auth blips. Reporting one deletes the workspace's credential on a single
  // failed turn, so the destructive half needs a machine-emitted marker.
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
  // The bare substring "revoked" reads a NEGATION and a field name as a
  // confirmed revocation, and this gate deletes the credential for every
  // runtime in the workspace. The anchored phrases ("has been revoked",
  // "access revoked", "token_revoked") survive neither.
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
  // The anthropic path (backends/claude/errors.ts) hands the provider's verbatim
  // text straight through, so these are the shapes the strict list must keep
  // catching after anchoring.
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
  // No served-providers entry = a desktop keychain login. It never backed this
  // turn and is none of the control plane's business.
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
  // An api_key has no revocation semantics worth acting on here; treating one
  // as revoked would delete a key the user still wants. The oauth-only gate is
  // enforced at CAPTURE — every digest source (the credential store's
  // request-time read, the Claude spawn env, the per-turn hydrated read)
  // digests OAuth access tokens only — so an api_key turn reaches the reporter
  // with `undefined` and skips.
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
  // A control plane whose DELETE→GET path lags can re-serve a token this pod
  // already reported dead; re-reporting it re-fires the confirmed delete and
  // its Sentry trail once per failed turn. Once is enough — the delete is
  // idempotent, and the reconnect card is already up.
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

    // A DIFFERENT token (the workspace reconnected, then that one died too)
    // is a new fact and reports again.
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
    // The failed attempt un-marked itself; the second turn's report went out.
    expect(reports).toBe(2);
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
});

test("a failing control plane never throws into the caller", async () => {
  // This runs inside error handling for a turn that already failed; a
  // reporting hiccup must not replace the real provider error.
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
