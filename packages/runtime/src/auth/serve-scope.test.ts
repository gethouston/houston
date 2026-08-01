import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { classifyProviderError } from "../ai/provider-error";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import { authPathIn } from "./auth-file";
import { syncServedCredential } from "./serve";
import { resetServedScopes, servedScopeFor } from "./served-scope";

/**
 * Serve-mode hydration is PER ACTING IDENTITY (HOU-976 §2.6.4): a member's sync
 * forwards their acting-as token, writes only their own credential file, and
 * remembers WHOSE credential the gateway resolved so a turn's provider error can
 * offer "continue on the team account" honestly.
 */

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };
const bob = { actingAs: actingToken("sub-bob") };

/** The host's authoritative "not connected" 404 (see routes/credential.ts). */
const notConnected404 = () =>
  new Response(null, {
    status: 404,
    headers: { "x-houston-not-connected": "1" },
  });

/** Records the acting-as header each probe carried, and serves ONE provider. */
function serveOnly(
  provider: string,
  body: Record<string, unknown>,
): { fetchImpl: typeof globalThis.fetch; actingSeen: Set<string> } {
  const actingSeen = new Set<string>();
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    actingSeen.add(headers.get("x-houston-acting-as") ?? "(none)");
    const asked = new URL(String(input)).searchParams.get("provider");
    if (asked !== provider) return notConnected404();
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, actingSeen };
}

async function withServeMode(
  fetchImpl: typeof globalThis.fetch,
  run: () => Promise<void>,
): Promise<void> {
  const prev = {
    url: config.controlPlaneUrl,
    token: config.sandboxToken,
    dataDir: config.dataDir,
    fetch: globalThis.fetch,
  };
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-serve-scope-"));
  globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    globalThis.fetch = prev.fetch;
    config.controlPlaneUrl = prev.url;
    config.sandboxToken = prev.token;
    config.dataDir = prev.dataDir;
  }
}

afterEach(() => resetServedScopes());

test("a member's serve sync writes ONLY that member's file and forwards their token", async () => {
  const { fetchImpl, actingSeen } = serveOnly("openrouter", {
    provider: "openrouter",
    kind: "api_key",
    access: "sk-alice-personal",
    expires: 0,
    accountId: null,
    scope: "personal",
  });
  await withServeMode(fetchImpl, async () => {
    const applied = await runWithActingContext(alice, () =>
      syncServedCredential(),
    );
    expect(applied).toEqual(["openrouter"]);
    // Every probe proved WHO it was for.
    expect([...actingSeen]).toEqual([alice.actingAs]);
    // The credential landed in Alice's file, and NOT in the team's.
    const alicePath = authPathIn(config.dataDir, "u:sub-alice");
    expect(JSON.parse(readFileSync(alicePath, "utf8"))).toEqual({
      openrouter: { type: "api_key", key: "sk-alice-personal" },
    });
    expect(existsSync(join(config.dataDir, "auth.json"))).toBe(false);
    expect(existsSync(join(config.dataDir, "served-providers.json"))).toBe(
      false,
    );
    // One member synced, so exactly one member's files exist.
    expect(readdirSync(join(config.dataDir, "auth-users")).sort()).toEqual(
      [
        alicePath.split("/").pop(),
        `${alicePath
          .split("/")
          .pop()
          ?.replace(/\.json$/, "")}.served-providers.json`,
      ].sort(),
    );
  });
});

test("the gateway's scope verdict is remembered per member, not process-wide", async () => {
  const { fetchImpl } = serveOnly("openrouter", {
    provider: "openrouter",
    kind: "api_key",
    access: "sk-alice-personal",
    expires: 0,
    accountId: null,
    scope: "personal",
  });
  await withServeMode(fetchImpl, async () => {
    await runWithActingContext(alice, () => syncServedCredential());
    expect(
      runWithActingContext(alice, () => servedScopeFor("openrouter")),
    ).toBe("personal");
    // Bob never synced: nothing may be attributed to him…
    expect(
      runWithActingContext(bob, () => servedScopeFor("openrouter")),
    ).toBeUndefined();
    // …nor to a turn with no acting identity at all.
    expect(servedScopeFor("openrouter")).toBeUndefined();
  });
});

test("no acting identity: the sync keeps writing auth.json and records no scope", async () => {
  const { fetchImpl, actingSeen } = serveOnly("openrouter", {
    provider: "openrouter",
    kind: "api_key",
    access: "sk-team",
    expires: 0,
    accountId: null,
  });
  await withServeMode(fetchImpl, async () => {
    const applied = await syncServedCredential();
    expect(applied).toEqual(["openrouter"]);
    expect([...actingSeen]).toEqual(["(none)"]);
    expect(
      JSON.parse(readFileSync(join(config.dataDir, "auth.json"), "utf8")),
    ).toEqual({ openrouter: { type: "api_key", key: "sk-team" } });
    expect(existsSync(join(config.dataDir, "auth-users"))).toBe(false);
    expect(servedScopeFor("openrouter")).toBeUndefined();
  });
});

test("two members' concurrent syncs do not share one in-flight result", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const acting = headers.get("x-houston-acting-as");
    const asked = new URL(String(input)).searchParams.get("provider");
    // Alice has a personal openrouter key; Bob has nothing connected.
    if (acting !== alice.actingAs || asked !== "openrouter")
      return notConnected404();
    return new Response(
      JSON.stringify({
        provider: "openrouter",
        kind: "api_key",
        access: "sk-alice-personal",
        expires: 0,
        accountId: null,
        scope: "personal",
      }),
      { status: 200 },
    );
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const [aliceApplied, bobApplied] = await Promise.all([
      runWithActingContext(alice, () => syncServedCredential()),
      runWithActingContext(bob, () => syncServedCredential()),
    ]);
    expect(aliceApplied).toEqual(["openrouter"]);
    expect(bobApplied).toEqual([]);
    expect(existsSync(authPathIn(config.dataDir, "u:sub-bob"))).toBe(false);
  });
});

test("a turn's provider error carries the credential scope only for the member it ran for", async () => {
  const { fetchImpl } = serveOnly("openrouter", {
    provider: "openrouter",
    kind: "api_key",
    access: "sk-alice-personal",
    expires: 0,
    accountId: null,
    scope: "personal",
  });
  const rateLimited = {
    provider: "openrouter",
    model: "some-model",
    message: "429 rate limit exceeded",
  };
  await withServeMode(fetchImpl, async () => {
    await runWithActingContext(alice, () => syncServedCredential());
    // Alice's turn: the card can name the account that hit the limit.
    expect(
      runWithActingContext(alice, () => classifyProviderError(rateLimited)),
    ).toEqual({
      kind: "rate_limited",
      provider: "openrouter",
      model: "some-model",
      retry_after_seconds: null,
      message: "429 rate limit exceeded",
      credential: { scope: "personal" },
    });
    // Bob's turn, and a turn with no identity, are stamped with nothing —
    // the desktop/self-host shape, unchanged.
    expect(
      runWithActingContext(bob, () => classifyProviderError(rateLimited))
        .credential,
    ).toBeUndefined();
    expect(classifyProviderError(rateLimited).credential).toBeUndefined();
  });
});
