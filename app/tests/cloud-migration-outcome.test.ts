import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_MIGRATION_OUTCOME_KEY,
  clearCloudMigrationOutcome,
  readCloudMigrationOutcome,
  writeCloudMigrationOutcome,
} from "../src/lib/cloud-migration-outcome.ts";
import {
  type KeyedStorage,
  purgeAccountLocalState,
} from "../src/lib/houston-local-state.ts";

function memoryStorage(entries: [string, string][] = []) {
  const store = new Map(entries);
  const storage: KeyedStorage & {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
  } = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  return { store, storage };
}

test("a finished migration survives sign-out and holds for another account", () => {
  const { storage } = memoryStorage();
  writeCloudMigrationOutcome(storage, "done");
  purgeAccountLocalState(storage);
  assert.equal(readCloudMigrationOutcome(storage, "uid-a"), "done");
  assert.equal(readCloudMigrationOutcome(storage, "uid-b"), "done");
  assert.equal(readCloudMigrationOutcome(storage, null), "done");
});

test("a declined migration also holds machine-wide", () => {
  const { storage } = memoryStorage();
  writeCloudMigrationOutcome(storage, "skipped");
  purgeAccountLocalState(storage);
  assert.equal(readCloudMigrationOutcome(storage, "uid-b"), "skipped");
});

test("no outcome reads as null", () => {
  const { storage } = memoryStorage([["houston.cloudMigration.x", "bogus"]]);
  assert.equal(readCloudMigrationOutcome(storage, "x"), null);
});

test("an older build's per-uid flag is promoted to the device key", () => {
  const { store, storage } = memoryStorage([
    ["houston.cloudMigration.uid-a", "done"],
  ]);
  assert.equal(readCloudMigrationOutcome(storage, "uid-a"), "done");
  assert.equal(store.get(CLOUD_MIGRATION_OUTCOME_KEY), "done");
  assert.equal(store.has("houston.cloudMigration.uid-a"), false);
  purgeAccountLocalState(storage);
  assert.equal(readCloudMigrationOutcome(storage, "uid-b"), "done");
});

test("the Settings re-run clears the device key and the old per-uid flag", () => {
  const { store, storage } = memoryStorage([
    [CLOUD_MIGRATION_OUTCOME_KEY, "skipped"],
    ["houston.cloudMigration.uid-a", "skipped"],
  ]);
  clearCloudMigrationOutcome(storage, "uid-a");
  assert.equal(store.size, 0);
  assert.equal(readCloudMigrationOutcome(storage, "uid-a"), null);
});
