import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";

/**
 * `GET /providers` END-TO-END under two acting identities (HOU-976).
 *
 * server-acting.test.ts proves the transport wrap reaches a route, but it mocks
 * `./provider-routes` away — so the REAL route's per-scope behavior was never
 * exercised. This suite runs the unmocked route through an actual HTTP server
 * and asserts the two things a member's model picker depends on:
 *  1. each identity's `configured` comes from ITS OWN credential file, and no
 *     member's connection is ever visible to another member or to the team;
 *  2. the row names WHOSE credential produced `configured` (`credentialScope`),
 *     and stays byte-identical to the pre-HOU-976 shape for a request with no
 *     acting identity.
 *
 * The ONE stub: `refreshAnthropicCredential`, which `GET /providers` calls to
 * warm the shared-dir probe. It SPAWNS `claude auth status`, so a developer's
 * real Claude login would flip the anthropic row to connected and make the
 * result machine-dependent (and every request pay a subprocess). Nothing else is
 * mocked — `anthropicCredentialCached` (the sync signal the rows actually read)
 * stays real, and answers from this suite's empty `HOUSTON_HOME`.
 */
vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  refreshAnthropicCredential: async () => false,
}));

/** The gateway's per-turn acting-as token, minted exactly as the gateway does. */
function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const ALICE = actingToken("sub-alice");
const BOB = actingToken("sub-bob");
const CONTROL_PLANE = "http://control-plane.test";

const dataDir = mkdtempSync(join(tmpdir(), "houston-providers-scope-"));
// The runtime reads its data dir from the environment at import time, so it is
// pinned BEFORE the modules under test load. HOUSTON_HOME roots the shared
// claude-login dir inside this empty temp tree too, so the real anthropic
// signal cannot read a credential off the developer's machine.
const prevEnv = {
  dataDir: process.env.HOUSTON_DATA_DIR,
  home: process.env.HOUSTON_HOME,
};
process.env.HOUSTON_DATA_DIR = dataDir;
process.env.HOUSTON_HOME = dataDir;

// auth-file.ts is config-free (pure path + file logic), so importing it here to
// compute the per-scope paths does not pin the data dir before the assignment
// above — the modules that DO read config are imported after it.
const { authPathIn } = await import("../auth/auth-file");

/**
 * Seed one scope's credential file the way production writes it: the team scope's
 * `<dataDir>/auth.json`, a member's `<dataDir>/auth-users/<sha256(sub)[:16]>.json`.
 * Written before the store is constructed, so its warm team cache and every
 * lazily-opened personal cache read these bytes.
 */
function seedScope(scopeKey: string, providers: Record<string, string>): void {
  const path = authPathIn(dataDir, scopeKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(providers).map(([provider, key]) => [
          provider,
          { type: "api_key", key },
        ]),
      ),
    ),
  );
}

seedScope("team", { deepseek: "sk-team-deepseek" });
seedScope("u:sub-alice", { openrouter: "sk-alice-openrouter" });
seedScope("u:sub-bob", { google: "sk-bob-gemini" });

const { config } = await import("../config");
const { createRuntimeServer } = await import("./server");
const { resetServedScopes } = await import("../auth/served-scope");

interface ProviderRow {
  id: string;
  configured: boolean;
  credentialScope?: "personal" | "team";
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string")
        throw new Error("test server did not bind a TCP port");
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

/** Run `fn` against a live runtime server, always closing the port after. */
async function withServer(
  fn: (get: (actingAs?: string) => Promise<ProviderRow[]>) => Promise<void>,
): Promise<void> {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  const auth = config.token
    ? { Authorization: `Bearer ${config.token}` }
    : undefined;
  const get = async (actingAs?: string): Promise<ProviderRow[]> => {
    const res = await fetch(`${baseUrl}/providers`, {
      headers: {
        ...auth,
        ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
      },
    });
    expect(res.status).toBe(200);
    return (await res.json()) as ProviderRow[];
  };
  try {
    await fn(get);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

function row(rows: ProviderRow[], id: string): ProviderRow {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no /providers row for ${id}`);
  return found;
}

/** Which providers a request saw as connected — the picker's whole input. */
function configuredIds(rows: ProviderRow[]): string[] {
  return rows.filter((r) => r.configured).map((r) => r.id);
}

afterEach(() => {
  resetServedScopes();
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
});

// The env pins above outlive this file's module graph, so they are handed back —
// a worker shared with another suite must not inherit this temp data dir.
afterAll(() => {
  restoreEnv("HOUSTON_DATA_DIR", prevEnv.dataDir);
  restoreEnv("HOUSTON_HOME", prevEnv.home);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("GET /providers answers each acting identity from its OWN credential file", async () => {
  // Serve mode off: this is the file-backed truth alone (a pod between syncs, a
  // self-hosted deployment), so nothing here can come from a gateway response.
  config.controlPlaneUrl = "";
  config.sandboxToken = "";

  await withServer(async (get) => {
    const alice = await get(ALICE);
    expect(configuredIds(alice)).toEqual(["openrouter"]);

    // Bob is the inverse: his own key, and NOT a byte of Alice's or the team's.
    const bob = await get(BOB);
    expect(configuredIds(bob)).toEqual(["google"]);

    // No header: the team file, exactly as desktop / self-host / every
    // pre-HOU-976 caller sees it — neither member's connection leaks in.
    const team = await get();
    expect(configuredIds(team)).toEqual(["deepseek"]);

    // With no serve verdict recorded, no row carries the scope labels — the
    // pre-HOU-976 row shape, unchanged for every identity.
    for (const rows of [alice, bob, team]) {
      for (const r of rows) {
        expect(r).not.toHaveProperty("credentialScope");
      }
    }
  });
});

test("GET /providers labels WHOSE credential served each acting identity", async () => {
  config.controlPlaneUrl = CONTROL_PLANE;
  config.sandboxToken = "sbx-token";
  const realFetch = globalThis.fetch;
  // Stands in for the gateway's /sandbox/credential: Alice is served her OWN
  // openrouter key, Bob is served the TEAM's Gemini key (the two verdicts the
  // picker labels differently), and every other pair is an authoritative
  // "not connected". Requests to the test server itself pass through.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(CONTROL_PLANE)) return realFetch(input, init);
    const actingAs = new Headers(init?.headers).get("x-houston-acting-as");
    const provider = new URL(url).searchParams.get("provider");
    const served =
      actingAs === ALICE && provider === "openrouter"
        ? {
            provider,
            kind: "api_key",
            access: "sk-alice-openrouter",
            expires: 0,
            accountId: null,
            scope: "personal",
          }
        : actingAs === BOB && provider === "google"
          ? {
              provider,
              kind: "api_key",
              // AIza-shaped: a served google key of any other shape is the
              // dead legacy family served-key-guard.ts refuses (HOU-1107).
              access: "AIzaTeamGemini",
              expires: 0,
              accountId: null,
              scope: "team",
            }
          : null;
    return served
      ? new Response(JSON.stringify(served), { status: 200 })
      : new Response(null, {
          status: 404,
          headers: { "x-houston-not-connected": "1" },
        });
  }) as typeof globalThis.fetch;

  try {
    await withServer(async (get) => {
      const alice = await get(ALICE);
      expect(row(alice, "openrouter")).toMatchObject({
        configured: true,
        credentialScope: "personal",
      });
      // Bob's provider is untouched for Alice, and an unserved row carries no
      // stale label.
      expect(row(alice, "google").configured).toBe(false);
      expect(row(alice, "google")).not.toHaveProperty("credentialScope");

      const bob = await get(BOB);
      expect(row(bob, "google")).toMatchObject({
        configured: true,
        credentialScope: "team",
      });
      expect(row(bob, "openrouter").configured).toBe(false);
      expect(row(bob, "openrouter")).not.toHaveProperty("credentialScope");

      // A request with no acting identity keeps the team file and the exact
      // pre-HOU-976 row shape: one credential, nothing to disambiguate.
      const team = await get();
      expect(configuredIds(team)).toEqual(["deepseek"]);
      for (const r of team) {
        expect(r).not.toHaveProperty("credentialScope");
      }
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
