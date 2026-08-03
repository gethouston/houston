import { beforeEach, expect, test } from "vitest";
import { sharedCredentialRefresher } from "../credentials/refresh-coalescer";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import type { TurnDeps } from "./deps";
import { freshCredential } from "./fresh-credential";

/**
 * The per-turn credential comes from the SAME coalescer the serve route uses.
 * A second, uncoalesced rotator would spend the workspace's rotating refresh
 * token concurrently with the serve path — the first exchange wins and the
 * loser's `invalid_grant` disconnects the user.
 */

const FRESH = () => Date.now() + 3_600_000;

beforeEach(() => sharedCredentialRefresher.reset());

async function expiringStore(): Promise<MemoryCredentialStore> {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "ws1",
    provider: "openai-codex",
    accessToken: "AT-old",
    refreshToken: "rt.rotating",
    expiresAt: 1,
  });
  return credentials;
}

const turnDeps = (
  credentials: CredentialStore,
  refresh: (cred: WorkspaceCredential) => Promise<WorkspaceCredential>,
): TurnDeps => ({ credentials, refresh }) as unknown as TurnDeps;

test("freshCredential spends the rotating refresh token exactly once per burst", async () => {
  const credentials = await expiringStore();
  let refreshes = 0;
  const deps = turnDeps(credentials, async (cred) => {
    refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ...cred,
      accessToken: "AT-new",
      refreshToken: "rt.rotated",
      expiresAt: FRESH(),
    };
  });

  const [a, b] = await Promise.all([
    freshCredential(deps, "ws1", "openai-codex"),
    freshCredential(deps, "ws1", "openai-codex"),
  ]);

  expect(refreshes).toBe(1);
  expect(a?.accessToken).toBe("AT-new");
  expect(b).toBe(a);
  expect((await credentials.get("ws1", "openai-codex"))?.refreshToken).toBe(
    "rt.rotated",
  );
});

test("freshCredential reports a mid-refresh disconnect as not-connected", async () => {
  const memory = await expiringStore();
  let reads = 0;
  const credentials: CredentialStore = {
    get: async (workspaceId, provider, acting) =>
      ++reads === 1 ? memory.get(workspaceId, provider, acting) : null,
    put: (cred, opts) => memory.put(cred, opts),
    remove: (workspaceId, provider, acting) =>
      memory.remove(workspaceId, provider, acting),
    removeIfAccess: async () => false,
  };
  const deps = turnDeps(credentials, async () => {
    throw new Error("a deleted credential must never be refreshed");
  });

  expect(await freshCredential(deps, "ws1", "openai-codex")).toBeNull();
});
