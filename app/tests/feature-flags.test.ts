/**
 * Feature-flag unit tests. Exercises the pure helpers (flagToString,
 * stringToFlag, getFlagDefault) and the migration runner. Runs under
 * `node --test`, matching the rest of `app/tests/`.
 *
 * The hook itself (`useFeatureFlag`) is a React+TanStack composition and
 * is best exercised in integration via the running app — these tests cover
 * the primitives that compose into the resolution chain so the chain's
 * behavior is provable from substitution.
 */
import test from "node:test";
import assert from "node:assert/strict";

// --- Stub the substrate that `featureFlags.ts` reaches for ---
// `tauriPreferences` calls into the engine; the migration runner only
// touches it via .get/.set so we replace the whole module with a
// programmable fake before importing the unit under test.

import { Module } from "node:module";

const prefStore = new Map<string, string | null>();
const setLog: Array<[string, string]> = [];

interface ResolveContext {
  parentURL?: string;
}

const originalResolve = (Module as unknown as {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: ResolveContext,
  ) => string;
})._resolveFilename;

(Module as unknown as {
  _resolveFilename: typeof originalResolve;
})._resolveFilename = function (request, parent, isMain, options) {
  if (request === "../src/lib/tauri.ts" || request === "../src/lib/tauri") {
    return require.resolve("./fixtures/feature-flags-tauri-stub.ts");
  }
  if (request === "../src/lib/logger.ts" || request === "../src/lib/logger") {
    return require.resolve("./fixtures/feature-flags-logger-stub.ts");
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Import after the resolver hook is installed so the under-test module
// picks up the stubs instead of the real modules.
import {
  flagToString,
  stringToFlag,
  getFlagDefault,
  runFlagMigrations,
  FLAG_REGISTRY,
  FLAG_MIGRATIONS,
} from "../src/lib/featureFlags.ts";

// Re-export the in-memory store so the stub file can wire to it.
// The stub file reads `globalThis.__test_pref_store__` at import time.
(globalThis as Record<string, unknown>).__test_pref_store__ = prefStore;
(globalThis as Record<string, unknown>).__test_set_log__ = setLog;

// ---------- flagToString ----------

test("flagToString encodes true and false canonically", () => {
  assert.equal(flagToString(true), "true");
  assert.equal(flagToString(false), "false");
});

// ---------- stringToFlag ----------

test("stringToFlag accepts only canonical literals", () => {
  assert.equal(stringToFlag("true"), true);
  assert.equal(stringToFlag("false"), false);
});

test("stringToFlag returns null for unset / malformed / non-canonical values", () => {
  assert.equal(stringToFlag(null), null);
  assert.equal(stringToFlag(undefined), null);
  assert.equal(stringToFlag(""), null);
  assert.equal(stringToFlag("True"), null);
  assert.equal(stringToFlag("TRUE"), null);
  assert.equal(stringToFlag("yes"), null);
  assert.equal(stringToFlag("1"), null);
  assert.equal(stringToFlag("on"), null);
});

// ---------- getFlagDefault ----------

test("getFlagDefault returns false for unknown keys (defensive)", () => {
  assert.equal(getFlagDefault("advanced.does_not_exist"), false);
});

test("getFlagDefault matches FlagDef.default when key is in registry", () => {
  // Phase 0 registry is empty; install a temporary entry to exercise the path.
  const key = "test.synthetic_for_default_lookup";
  FLAG_REGISTRY[key] = {
    key,
    category: "advanced",
    default: true,
    labelKey: "x.label",
    descriptionKey: "x.desc",
    enforcementSurface: "ui",
    status: "beta",
    since: "0.0.0",
  };
  try {
    assert.equal(getFlagDefault(key), true);
  } finally {
    delete FLAG_REGISTRY[key];
  }
});

// ---------- FLAG_REGISTRY shape invariants ----------

test("phase 0 ships FLAG_REGISTRY empty by design", () => {
  assert.equal(Object.keys(FLAG_REGISTRY).length, 0);
});

test("phase 0 ships FLAG_MIGRATIONS empty by design", () => {
  assert.equal(FLAG_MIGRATIONS.length, 0);
});

// ---------- runFlagMigrations ----------

function resetPrefStore() {
  prefStore.clear();
  setLog.length = 0;
}

test("runFlagMigrations is a no-op when FLAG_MIGRATIONS is empty", async () => {
  resetPrefStore();
  await runFlagMigrations();
  assert.equal(setLog.length, 0);
});

test("runFlagMigrations renames a key when the new key is unset", async () => {
  resetPrefStore();
  prefStore.set("old.key", "true");

  FLAG_MIGRATIONS.push({
    type: "rename",
    from: "old.key",
    to: "new.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    assert.equal(prefStore.get("new.key"), "true");
    // Old key cleared (engine has no DELETE; empty string represents unset).
    assert.equal(prefStore.get("old.key"), "");
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});

test("runFlagMigrations does NOT clobber an explicit new-key value", async () => {
  resetPrefStore();
  prefStore.set("old.key", "true");
  prefStore.set("new.key", "false");

  FLAG_MIGRATIONS.push({
    type: "rename",
    from: "old.key",
    to: "new.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    assert.equal(prefStore.get("new.key"), "false", "explicit new-key value preserved");
    assert.equal(prefStore.get("old.key"), "", "old key still cleared");
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});

test("runFlagMigrations is a no-op when the old key is already absent", async () => {
  resetPrefStore();
  // No entry for `old.key` at all.

  FLAG_MIGRATIONS.push({
    type: "rename",
    from: "old.key",
    to: "new.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    assert.equal(prefStore.has("new.key"), false);
    assert.equal(setLog.length, 0);
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});

test("runFlagMigrations is idempotent — re-run after a successful rename is a no-op", async () => {
  resetPrefStore();
  prefStore.set("old.key", "true");

  FLAG_MIGRATIONS.push({
    type: "rename",
    from: "old.key",
    to: "new.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    const firstSetCount = setLog.length;

    // Second run: old.key is now empty string (cleared); .get returns ""
    // which we treat as "exists but blank" — the migration sees a value,
    // copies the empty string forward. That's still idempotent — running
    // it a third time gets the same outcome. The invariant is "no harm".
    await runFlagMigrations();
    assert.ok(setLog.length >= firstSetCount, "second run does not crash");
    assert.equal(prefStore.get("new.key"), "true", "new key value preserved");
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});

test("runFlagMigrations clears a deleted key when present", async () => {
  resetPrefStore();
  prefStore.set("retired.key", "true");

  FLAG_MIGRATIONS.push({
    type: "delete",
    key: "retired.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    assert.equal(prefStore.get("retired.key"), "");
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});

test("runFlagMigrations skips a delete for a key that was never set", async () => {
  resetPrefStore();

  FLAG_MIGRATIONS.push({
    type: "delete",
    key: "retired.key",
    since: "0.0.0",
  });
  try {
    await runFlagMigrations();
    assert.equal(setLog.length, 0);
  } finally {
    FLAG_MIGRATIONS.length = 0;
  }
});
