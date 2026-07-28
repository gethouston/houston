import assert from "node:assert/strict";
import test from "node:test";
import {
  migrationProviderSignals,
  shouldShowMigrationReconnect,
} from "../src/hooks/migration-reconnect-trigger.ts";
import type { ProviderConnectionStatus } from "../src/lib/provider-connection.ts";

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

// HOU-979: the gate used to read the denormalized `authenticated` flag, so an
// `unknown` probe (unreachable engine, waking pod, a space whose agent list is
// still settling) read as "no provider" — and a migrated user who IS connected
// got the reconnect screen. The signals now come from the ONE derivation, and
// an unconfirmable answer defers the gate instead of firing it.

const probe = (
  over: Partial<ProviderConnectionStatus>,
): ProviderConnectionStatus => ({
  cli_installed: true,
  auth_state: "authenticated",
  authenticated: true,
  ...over,
});

test("a CONFIRMED connection reports hasProvider and nothing unconfirmable", () => {
  assert.deepEqual(migrationProviderSignals([probe({})]), {
    hasProvider: true,
    unconfirmable: false,
  });
});

test("a CONFIRMED sign-out reports neither a provider nor an unknown", () => {
  assert.deepEqual(
    migrationProviderSignals([
      probe({ auth_state: "unauthenticated", authenticated: false }),
    ]),
    { hasProvider: false, unconfirmable: false },
  );
});

test("an UNKNOWN probe is unconfirmable, never a confirmed absence", () => {
  const signals = migrationProviderSignals([
    probe({ auth_state: "unknown", authenticated: false }),
  ]);
  assert.equal(signals.hasProvider, false);
  assert.equal(signals.unconfirmable, true);
});

test("the gate DEFERS on an unconfirmable probe instead of showing", () => {
  // The exact regression: statuses settle `unknown` for a migrated user whose
  // provider is in fact connected. Firing here would demand a reconnect they
  // do not need; the unconfirmable signal folds into `loading` so it does not.
  const { hasProvider, unconfirmable } = migrationProviderSignals([
    probe({ auth_state: "unknown", authenticated: false }),
  ]);
  assert.equal(
    shouldShowMigrationReconnect({
      ...SHOW,
      hasProvider,
      loading: unconfirmable,
    }),
    false,
  );
});
