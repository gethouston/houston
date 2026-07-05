import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowMigrationReconnect } from "../src/hooks/migration-reconnect-trigger.ts";

// The "show" case: a migrated user, on the new engine, with no provider and no
// prior dismissal, once every signal has resolved.
const SHOW = {
  newEngine: true,
  coLocated: true,
  migrated: true,
  hasProvider: false,
  dismissed: false,
  loading: false,
};

test("shows when migrated, new engine, no provider, not dismissed", () => {
  assert.equal(shouldShowMigrationReconnect(SHOW), true);
});

test("hidden while any signal is still loading", () => {
  assert.equal(shouldShowMigrationReconnect({ ...SHOW, loading: true }), false);
});

test("hidden on a fresh, non-migrated install", () => {
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, migrated: false }),
    false,
  );
});

test("hidden once a provider is connected (the reconnect succeeded)", () => {
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, hasProvider: true }),
    false,
  );
});

test("hidden once the user has dismissed it — never shows twice", () => {
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, dismissed: true }),
    false,
  );
});

test("hidden on the legacy Rust engine even if it looks migrated", () => {
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, newEngine: false }),
    false,
  );
});

test("hidden on a remote engine even if its /v1/version claims migrated (HOU-688)", () => {
  // The hosted gateway synthesizes `chatHistoryMigrated: true`; a remote
  // engine can never be "this install migrated", so the gate stays closed.
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, coLocated: false }),
    false,
  );
});

test("loading wins over every show condition", () => {
  // Even with all show-conditions met, a loading signal holds the gate closed.
  assert.equal(shouldShowMigrationReconnect({ ...SHOW, loading: true }), false);
  // And a not-yet-resolved provider probe must never flash the gate in front
  // of a user who is in fact connected.
  assert.equal(
    shouldShowMigrationReconnect({
      ...SHOW,
      hasProvider: true,
      loading: true,
    }),
    false,
  );
});
