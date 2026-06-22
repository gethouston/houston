import test from "node:test";
import assert from "node:assert/strict";
import {
  RELEASE_AUTH_STORAGE_KEY,
  createLocalAuthStorageKey,
  normalizeAuthStorageMode,
  resolveAuthStorageConfig,
} from "../src/lib/auth-storage.ts";

test("release auth storage uses Keychain-backed production key", () => {
  assert.deepEqual(
    resolveAuthStorageConfig({
      storageMode: "keychain",
      storageScope: "worktree-a",
    }),
    {
      mode: "keychain",
      storageKey: RELEASE_AUTH_STORAGE_KEY,
    },
  );
});

test("local auth storage uses browser storage scoped to worktree", () => {
  assert.deepEqual(
    resolveAuthStorageConfig({
      storageMode: "browser",
      storageScope: "abc123",
    }),
    {
      mode: "browser",
      storageKey: "houston-auth-local-abc123",
    },
  );
});

test("local auth storage falls back to stable nonempty scope", () => {
  assert.equal(createLocalAuthStorageKey("   "), "houston-auth-local-default");
});

test("unknown auth storage mode fails closed to browser storage", () => {
  assert.equal(normalizeAuthStorageMode("bad-value"), "browser");
});
