import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { afterEach, expect, test } from "vitest";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import { authPathIn, servedProvidersPathIn } from "./auth-file";
import { reportRevokedServedToken } from "./report-revoked";
import { recordServedScope, resetServedScopes } from "./served-scope";

/**
 * The reporter is a DELETE trigger for a workspace-wide credential, so the
 * gating is the safety-critical part: every test here is about what must NOT
 * produce a report (HOU-952).
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

/** A served anthropic oauth credential on disk, as a serve sync would leave it. */
function servedAnthropic(dataDir: string, access = "served-access"): void {
  writeFileSync(
    join(dataDir, "auth.json"),
    JSON.stringify({
      anthropic: { type: "oauth", access, refresh: "", expires: 0 },
    }),
  );
  writeFileSync(
    join(dataDir, "served-providers.json"),
    JSON.stringify(["anthropic"]),
  );
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

afterEach(() => resetServedScopes());

const revoked: ProviderError = {
  kind: "unauthenticated",
  provider: "anthropic",
  cause: "token_revoked",
  message: "401 OAuth access token has been revoked",
};

test("reports a revoked served token, naming it by digest only", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir, "the-revoked-token"),
    () => reportRevokedServedToken(revoked),
  );

  expect(captured?.url).toBe(
    "http://control-plane.test/sandbox/credential/revoked",
  );
  expect(captured?.body.provider).toBe("anthropic");
  expect(captured?.body.accessSha256).toBe(accessDigest("the-revoked-token"));
  // The token itself must never leave the runtime.
  expect(JSON.stringify(captured?.body)).not.toContain("the-revoked-token");
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
        reportRevokedServedToken(revoked);
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
    () => reportRevokedServedToken(revoked),
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
      reportRevokedServedToken({
        ...revoked,
        cause: "invalid_api_key",
      } as ProviderError),
  );
  expect(captured).toBeNull();
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
    () => reportRevokedServedToken(revoked),
  );
  expect(captured).toBeNull();
});

test("does NOT report when serve mode is off", async () => {
  const captured = await withServeMode(
    (dir) => servedAnthropic(dir),
    () => reportRevokedServedToken(revoked),
    { serveMode: false },
  );
  expect(captured).toBeNull();
});

test("does NOT report an api_key credential", async () => {
  // An api_key has no revocation semantics worth acting on here; treating one
  // as revoked would delete a key the user still wants.
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
    () => reportRevokedServedToken(revoked),
  );
  expect(captured).toBeNull();
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
    expect(() => reportRevokedServedToken(revoked)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
});
