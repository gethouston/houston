import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { config } from "../config";
import {
  credentialScopeKeyFor,
  currentCredentialScope,
  runWithActingContext,
  TEAM_CREDENTIAL_SCOPE,
} from "../session/acting-context";
import { authPathIn, servedProvidersPathIn, writeAuthFile } from "./auth-file";
import {
  authFailureActive,
  noteAuthFailure,
  resetAuthFailures,
} from "./credential-health";
import { HoustonAuthStore } from "./credential-store";
import { exportCredential } from "./export";

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "houston-scope-"));
}

const apiKey = (key: string) => ({ type: "api_key" as const, key });

afterEach(() => resetAuthFailures());

test("signed bridge authority preserves the explicit pooled credential scope", () => {
  const actingAs = actingToken("synthetic-member");
  const keys = ["u:turn:workspace:agent-a", "u:turn:workspace:agent-b"];
  for (const key of keys) {
    runWithActingContext({ actingAs, credentialScopeKey: key }, () => {
      expect(currentCredentialScope()).toEqual({ key, actingAs });
    });
  }
  expect(currentCredentialScope()).toEqual({ key: TEAM_CREDENTIAL_SCOPE });
});

test("two concurrent operations under different acting subs resolve different credential files", async () => {
  const dir = tmpDataDir();
  const store = new HoustonAuthStore(join(dir, "auth.json"));
  const alice = { actingAs: actingToken("sub-alice") };
  const bob = { actingAs: actingToken("sub-bob") };

  let releaseAlice!: () => void;
  const parked = new Promise<void>((r) => (releaseAlice = r));
  const aliceWrite = runWithActingContext(alice, () =>
    store.modify("openrouter", async () => {
      await parked;
      return apiKey("sk-alice");
    }),
  );
  const bobWrite = runWithActingContext(bob, async () => {
    store.set("openrouter", apiKey("sk-bob"));
    expect(store.get("openrouter")).toEqual(apiKey("sk-bob"));
    releaseAlice();
  });
  await Promise.all([aliceWrite, bobWrite]);

  expect(runWithActingContext(alice, () => store.get("openrouter"))).toEqual(
    apiKey("sk-alice"),
  );
  expect(runWithActingContext(bob, () => store.get("openrouter"))).toEqual(
    apiKey("sk-bob"),
  );
  const alicePath = runWithActingContext(alice, () => store.currentPath());
  const bobPath = runWithActingContext(bob, () => store.currentPath());
  expect(alicePath).not.toBe(bobPath);
  expect(JSON.parse(readFileSync(alicePath, "utf8"))).toEqual({
    openrouter: apiKey("sk-alice"),
  });
  expect(JSON.parse(readFileSync(bobPath, "utf8"))).toEqual({
    openrouter: apiKey("sk-bob"),
  });
  expect(existsSync(join(dir, "auth.json"))).toBe(false);
  expect(readdirSync(join(dir, "auth-users")).sort()).toEqual(
    [alicePath, bobPath].map((p) => p.split("/").pop()).sort(),
  );
  expect(store.get("openrouter")).toBeUndefined();
});

test("one identity's concurrent writes still serialize behind the per-provider chain", async () => {
  const dir = tmpDataDir();
  const store = new HoustonAuthStore(join(dir, "auth.json"));
  const alice = { actingAs: actingToken("sub-alice") };
  const order: string[] = [];
  let release!: () => void;
  const parked = new Promise<void>((r) => (release = r));
  const first = runWithActingContext(alice, () =>
    store.modify("openai-codex", async () => {
      order.push("first-start");
      await parked;
      order.push("first-end");
      return apiKey("sk-1");
    }),
  );
  const second = runWithActingContext(alice, () =>
    store.modify("openai-codex", async (current) => {
      order.push("second-start");
      expect(current).toEqual(apiKey("sk-1"));
      return apiKey("sk-2");
    }),
  );
  release();
  await Promise.all([first, second]);
  expect(order).toEqual(["first-start", "first-end", "second-start"]);
  expect(runWithActingContext(alice, () => store.get("openai-codex"))).toEqual(
    apiKey("sk-2"),
  );
});

test("no acting identity: auth.json only — same path, same bytes, no auth-users dir", () => {
  const dir = tmpDataDir();
  const path = join(dir, "auth.json");
  const store = new HoustonAuthStore(path);
  store.set("openrouter", apiKey("sk-desktop"));

  expect(store.currentPath()).toBe(path);
  expect(readFileSync(path, "utf8")).toBe(
    JSON.stringify({ openrouter: { type: "api_key", key: "sk-desktop" } }),
  );
  expect(existsSync(join(dir, "auth-users"))).toBe(false);
  expect(readdirSync(dir)).toEqual(["auth.json"]);
});

test("a routine's acting USER never selects a personal scope (routines run on the team account)", () => {
  const dir = tmpDataDir();
  const store = new HoustonAuthStore(join(dir, "auth.json"));
  const path = runWithActingContext({ actingUser: "sub-alice" }, () =>
    store.currentPath(),
  );
  expect(path).toBe(join(dir, "auth.json"));
});

test("scope keys: no token is the team; a token is its sub; an unreadable token is neither", () => {
  expect(credentialScopeKeyFor(undefined)).toBe(TEAM_CREDENTIAL_SCOPE);
  expect(credentialScopeKeyFor(actingToken("sub-alice"))).toBe("u:sub-alice");
  const unreadable = credentialScopeKeyFor("acting-v1.@@@.sig");
  expect(unreadable).not.toBe(TEAM_CREDENTIAL_SCOPE);
  expect(unreadable).toMatch(/^u:unreadable-[0-9a-f]{16}$/);
});

test("scope paths: the team keeps auth.json; a member gets a hashed file under auth-users", () => {
  expect(authPathIn("/data", TEAM_CREDENTIAL_SCOPE)).toBe("/data/auth.json");
  expect(servedProvidersPathIn("/data", TEAM_CREDENTIAL_SCOPE)).toBe(
    "/data/served-providers.json",
  );
  const personal = authPathIn("/data", "u:sub-alice");
  expect(personal).toMatch(/^\/data\/auth-users\/[0-9a-f]{16}\.json$/);
  expect(personal).not.toContain("sub-alice");
  expect(servedProvidersPathIn("/data", "u:sub-alice")).toBe(
    personal.replace(/\.json$/, ".served-providers.json"),
  );
  expect(() => authPathIn("/data", "alice")).toThrow(
    /credential scope key must be/,
  );
});

test("a member's broken-credential mark does not disconnect another member's provider", () => {
  const alice = { actingAs: actingToken("sub-alice") };
  const bob = { actingAs: actingToken("sub-bob") };
  runWithActingContext(alice, () => noteAuthFailure("openrouter", "fp-alice"));
  expect(
    runWithActingContext(alice, () =>
      authFailureActive("openrouter", "fp-alice"),
    ),
  ).toBe(true);
  expect(
    runWithActingContext(bob, () => authFailureActive("openrouter", "fp-bob")),
  ).toBe(false);
  expect(authFailureActive("openrouter", "fp-team")).toBe(false);
});

test("connect-once capture exports the ACTING member's credential, not the team's", () => {
  const prevDataDir = config.dataDir;
  config.dataDir = tmpDataDir();
  try {
    const oauth = (access: string) => ({
      type: "oauth" as const,
      access,
      refresh: `rt-${access}`,
      expires: 1_900_000_000_000,
    });
    writeAuthFile(authPathIn(config.dataDir, TEAM_CREDENTIAL_SCOPE), {
      "openai-codex": oauth("at-team"),
    });
    writeAuthFile(authPathIn(config.dataDir, "u:sub-alice"), {
      "openai-codex": oauth("at-alice"),
    });

    expect(exportCredential("openai-codex")).toMatchObject({
      access: "at-team",
    });
    expect(
      runWithActingContext({ actingAs: actingToken("sub-alice") }, () =>
        exportCredential("openai-codex"),
      ),
    ).toMatchObject({ access: "at-alice" });
    expect(
      runWithActingContext({ actingAs: actingToken("sub-bob") }, () =>
        exportCredential("openai-codex"),
      ),
    ).toBeNull();
  } finally {
    config.dataDir = prevDataDir;
  }
});
