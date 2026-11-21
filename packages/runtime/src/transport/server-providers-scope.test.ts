import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";

vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  refreshAnthropicCredential: async () => false,
}));

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
const prevEnv = {
  dataDir: process.env.HOUSTON_DATA_DIR,
  home: process.env.HOUSTON_HOME,
};
process.env.HOUSTON_DATA_DIR = dataDir;
process.env.HOUSTON_HOME = dataDir;

const { authPathIn } = await import("../auth/auth-file");

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
const { noteAuthFailure, resetAuthFailures } = await import(
  "../auth/credential-health"
);
const { runWithActingContext } = await import("../session/acting-context");
const { createRuntimeServer } = await import("./server");
const { resetServedScopes } = await import("../auth/served-scope");

interface ProviderRow {
  id: string;
  configured: boolean;
  credentialScope?: "personal" | "team";
  health?: string;
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

function configuredIds(rows: ProviderRow[]): string[] {
  return rows.filter((r) => r.configured).map((r) => r.id);
}

afterEach(() => {
  resetAuthFailures();
  resetServedScopes();
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
});

afterAll(() => {
  restoreEnv("HOUSTON_DATA_DIR", prevEnv.dataDir);
  restoreEnv("HOUSTON_HOME", prevEnv.home);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("GET /providers answers each acting identity from its OWN credential file", async () => {
  config.controlPlaneUrl = "";
  config.sandboxToken = "";

  await withServer(async (get) => {
    const alice = await get(ALICE);
    expect(configuredIds(alice)).toEqual(["openrouter"]);

    const bob = await get(BOB);
    expect(configuredIds(bob)).toEqual(["google"]);

    const team = await get();
    expect(configuredIds(team)).toEqual(["deepseek"]);

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
      expect(row(alice, "google").configured).toBe(false);
      expect(row(alice, "google")).not.toHaveProperty("credentialScope");

      const bob = await get(BOB);
      expect(row(bob, "google")).toMatchObject({
        configured: true,
        credentialScope: "team",
      });
      expect(row(bob, "openrouter").configured).toBe(false);
      expect(row(bob, "openrouter")).not.toHaveProperty("credentialScope");

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

test("GET /providers reports WHY each acting identity's provider is (un)usable", async () => {
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
  runWithActingContext({ actingAs: ALICE }, () =>
    noteAuthFailure("openrouter"),
  );

  await withServer(async (get) => {
    const alice = await get(ALICE);
    expect(row(alice, "openrouter")).toMatchObject({
      configured: false,
      health: "needs_reconnect",
    });
    expect(row(alice, "google").health).toBe("not_connected");

    const bob = await get(BOB);
    expect(row(bob, "google")).toMatchObject({
      configured: true,
      health: "connected",
    });
    expect(row(bob, "openrouter").health).toBe("not_connected");

    const team = await get();
    expect(row(team, "deepseek")).toMatchObject({
      configured: true,
      health: "connected",
    });
  });
});
