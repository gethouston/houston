import assert from "node:assert/strict";
import test from "node:test";
import {
  migrationProviderSignals,
  shouldShowMigrationReconnect,
} from "../src/hooks/migration-reconnect-trigger.ts";
import type { ProviderConnectionStatus } from "../src/lib/provider-connection.ts";

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
  assert.equal(
    shouldShowMigrationReconnect({ ...SHOW, coLocated: false }),
    false,
  );
});

test("loading wins over every show condition", () => {
  assert.equal(shouldShowMigrationReconnect({ ...SHOW, loading: true }), false);
  assert.equal(
    shouldShowMigrationReconnect({
      ...SHOW,
      hasProvider: true,
      loading: true,
    }),
    false,
  );
});

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
