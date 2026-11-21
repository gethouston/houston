import assert from "node:assert/strict";
import test from "node:test";
import {
  activeProviderStatusScope,
  loadCachedProviderStatuses,
  providerProbeScopeChanged,
  purgeLegacyProviderStatusCache,
  saveCachedProviderStatuses,
} from "../src/lib/provider-status-cache.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";
import { snapshotGlobals } from "./support/restore-globals.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store),
  };
}

const key = (scope: string) => `houston.providerStatusCache.v2.${scope}`;
const LEGACY_KEY = "houston.providerStatusCache.v1";
const TEAM_ORG = "00000000000000ab";

const CONNECTED: ProviderStatus = {
  provider: "anthropic",
  cli_installed: true,
  auth_state: "authenticated",
  authenticated: true,
  cli_name: "claude",
};

test("round-trips a status snapshot", () => {
  const storage = memoryStorage();
  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
  assert.deepEqual(loadCachedProviderStatuses(storage), {
    anthropic: CONNECTED,
  });
});

test("empty storage yields an empty snapshot", () => {
  assert.deepEqual(loadCachedProviderStatuses(memoryStorage()), {});
});

test("corrupt JSON yields an empty snapshot", () => {
  const storage = memoryStorage({ [key("personal")]: "{not json" });
  assert.deepEqual(loadCachedProviderStatuses(storage), {});
});

test("malformed entries are dropped, valid ones kept", () => {
  const storage = memoryStorage({
    [key("personal")]: JSON.stringify({
      anthropic: CONNECTED,
      openai: { provider: "openai" },
      google: "authenticated",
    }),
  });
  assert.deepEqual(loadCachedProviderStatuses(storage), {
    anthropic: CONNECTED,
  });
});

test("a throwing storage backend is treated as no cache", () => {
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  assert.deepEqual(loadCachedProviderStatuses(throwing), {});
  assert.doesNotThrow(() =>
    saveCachedProviderStatuses({ anthropic: CONNECTED }, throwing),
  );
});

test("snapshots are isolated per space scope", () => {
  const storage = memoryStorage();
  const TEAM = "00000000000000ab";

  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage, "personal");
  saveCachedProviderStatuses({}, storage, TEAM);

  assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {
    anthropic: CONNECTED,
  });
  assert.deepEqual(loadCachedProviderStatuses(storage, TEAM), {});

  const keys = Object.keys(storage.dump());
  assert.ok(keys.includes(key("personal")));
  assert.ok(keys.includes(key(TEAM)));
});

test("the orphaned un-scoped v1 snapshot is purged", () => {
  const storage = memoryStorage({
    [LEGACY_KEY]: JSON.stringify({ anthropic: CONNECTED }),
    [key("personal")]: JSON.stringify({ anthropic: CONNECTED }),
  });

  purgeLegacyProviderStatusCache(storage);

  assert.equal(storage.getItem(LEGACY_KEY), null);
  assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {
    anthropic: CONNECTED,
  });
});

test("the scoped default resolves to the personal scope without a window", () => {
  const storage = memoryStorage();
  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
  assert.deepEqual(JSON.parse(storage.getItem(key("personal")) ?? "null"), {
    anthropic: CONNECTED,
  });
});

function inSpace<T>(org: string | null, fn: () => T): T {
  const restoreWindow = snapshotGlobals(["window"]);
  (
    globalThis as { window?: { __HOUSTON_ACTIVE_ORG__?: string | null } }
  ).window = { __HOUSTON_ACTIVE_ORG__: org };
  try {
    return fn();
  } finally {
    restoreWindow();
  }
}

test("a probe that resolves in the space it started in is kept", () => {
  inSpace(TEAM_ORG, () => {
    const startedIn = activeProviderStatusScope();
    assert.equal(startedIn, TEAM_ORG);
    assert.equal(providerProbeScopeChanged(startedIn), false);
  });
});

test("a probe overtaken by a space switch is dropped, both ways", () => {
  const startedPersonal = inSpace(null, activeProviderStatusScope);
  assert.equal(startedPersonal, "personal");
  inSpace(TEAM_ORG, () => {
    assert.equal(providerProbeScopeChanged(startedPersonal), true);
  });

  const startedInTeam = inSpace(TEAM_ORG, activeProviderStatusScope);
  inSpace(null, () => {
    assert.equal(providerProbeScopeChanged(startedInTeam), true);
  });
});

test("a dropped probe writes nothing under the space it resolved in", () => {
  const storage = memoryStorage();
  const startedIn = inSpace(null, activeProviderStatusScope);
  inSpace(TEAM_ORG, () => {
    if (!providerProbeScopeChanged(startedIn))
      saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
    assert.deepEqual(loadCachedProviderStatuses(storage, TEAM_ORG), {});
    assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {});
  });
});
