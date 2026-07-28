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

// The scoped-key grammar the cache uses (`.v2.<scope>`); node has no `window`,
// so the DEFAULT scope resolves to "personal".
const key = (scope: string) => `houston.providerStatusCache.v2.${scope}`;
const LEGACY_KEY = "houston.providerStatusCache.v1";
/** A team space's org slug, in the gateway's `[a-f0-9]{16}` shape. */
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
      openai: { provider: "openai" }, // missing fields
      google: "authenticated", // not an object
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

  // Personal-space snapshot: anthropic connected.
  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage, "personal");
  // A team space records a DIFFERENT world: nothing connected yet.
  saveCachedProviderStatuses({}, storage, TEAM);

  // Each scope reads back ONLY its own snapshot — no cross-space leak (HOU-906).
  assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {
    anthropic: CONNECTED,
  });
  assert.deepEqual(loadCachedProviderStatuses(storage, TEAM), {});

  // The keys are physically distinct.
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

  // The dead v1 key is gone; the live scoped key is untouched.
  assert.equal(storage.getItem(LEGACY_KEY), null);
  assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {
    anthropic: CONNECTED,
  });
});

test("the scoped default resolves to the personal scope without a window", () => {
  const storage = memoryStorage();
  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
  // The default-scope write lands under the personal key.
  assert.deepEqual(JSON.parse(storage.getItem(key("personal")) ?? "null"), {
    anthropic: CONNECTED,
  });
});

// HOU-979: a probe describes exactly one space. `providerProbeScopeChanged` is
// the rule the hub's probe applies when it resolves — the whole result is
// dropped when the user switched mid-flight, so no cross-space status is ever
// painted or persisted. Exercised here directly (the decision is pure; the hook
// only calls it).

/** Run `fn` with the active space pinned to `org` (null ⇒ personal). */
function inSpace<T>(org: string | null, fn: () => T): T {
  const previous = (globalThis as { window?: unknown }).window;
  (
    globalThis as { window?: { __HOUSTON_ACTIVE_ORG__?: string | null } }
  ).window = { __HOUSTON_ACTIVE_ORG__: org };
  try {
    return fn();
  } finally {
    (globalThis as { window?: unknown }).window = previous;
  }
}

test("a probe that resolves in the space it started in is kept", () => {
  inSpace(TEAM_ORG, () => {
    const startedIn = activeProviderStatusScope();
    assert.equal(startedIn, TEAM_ORG);
    // Nothing switched while it was in flight.
    assert.equal(providerProbeScopeChanged(startedIn), false);
  });
});

test("a probe overtaken by a space switch is dropped, both ways", () => {
  // Started personal, resolved inside a team…
  const startedPersonal = inSpace(null, activeProviderStatusScope);
  assert.equal(startedPersonal, "personal");
  inSpace(TEAM_ORG, () => {
    assert.equal(providerProbeScopeChanged(startedPersonal), true);
  });

  // …and the reverse: started in the team, resolved back in personal.
  const startedInTeam = inSpace(TEAM_ORG, activeProviderStatusScope);
  inSpace(null, () => {
    assert.equal(providerProbeScopeChanged(startedInTeam), true);
  });
});

test("a dropped probe writes nothing under the space it resolved in", () => {
  const storage = memoryStorage();
  // The hub's probe returns EARLY on a changed scope, so the persist below never
  // runs — the team's key stays empty rather than holding personal statuses.
  const startedIn = inSpace(null, activeProviderStatusScope);
  inSpace(TEAM_ORG, () => {
    if (!providerProbeScopeChanged(startedIn))
      saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
    assert.deepEqual(loadCachedProviderStatuses(storage, TEAM_ORG), {});
    assert.deepEqual(loadCachedProviderStatuses(storage, "personal"), {});
  });
});
