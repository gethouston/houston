/**
 * Pure trigger logic for the one-time post-migration "reconnect your AI"
 * moment, kept free of React + engine imports so it is unit-testable directly
 * (see `app/tests/migration-reconnect-trigger.test.ts`). The hook in
 * `use-migration-reconnect.ts` gathers the signals and delegates the decision
 * here.
 */

import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
} from "../lib/provider-connection.ts";

/**
 * The two provider signals the gate reads, derived from the probe's statuses
 * through the ONE shared derivation (HOU-979).
 */
export interface MigrationProviderSignals {
  /** At least one provider is CONFIRMED connected. */
  hasProvider: boolean;
  /**
   * At least one provider's probe came back `unknown`. "We could not check" is
   * not "nothing is connected": reading it as the latter puts a migrated user
   * who IS connected behind the reconnect gate. It folds into `loading` below
   * so the gate DEFERS instead of firing on an answer we do not have.
   */
  unconfirmable: boolean;
}

/** Derive both provider signals from the probed statuses. */
export function migrationProviderSignals(
  statuses: readonly ProviderConnectionStatus[],
): MigrationProviderSignals {
  return {
    hasProvider: statuses.some((s) => providerIsConnected(s)),
    unconfirmable: statuses.some(
      (s) => providerConnectionState(s, false) === "checking",
    ),
  };
}

/** Inputs to the "reconnect your AI" decision. */
export interface MigrationReconnectInputs {
  /** Active backend is the new TS host (the only build that migrates). */
  newEngine: boolean;
  /**
   * The engine runs on THIS machine (Tauri sidecar / loopback dev host). The
   * migration is a local-install moment — a legacy Rust-desktop db carried
   * over on disk — so a remote engine (hosted gateway, self-host VPS) can
   * never be "this install migrated": whatever its `/v1/version` reports, the
   * gate must stay closed (HOU-688).
   */
  coLocated: boolean;
  /** Host reports this install carried over a legacy Rust-desktop history db. */
  migrated: boolean;
  /** A provider is currently connected (auth complete). */
  hasProvider: boolean;
  /** The user has already seen + dismissed/completed this moment. */
  dismissed: boolean;
  /**
   * Any required signal is still loading. We hold the gate closed while
   * unknown so the moment never flickers in front of a user who actually has a
   * provider, and never blocks a fresh install during its first probes.
   */
  loading: boolean;
}

/**
 * The single source of truth for whether to show the migration reconnect
 * moment. Show it only when ALL hold: new engine, the host says we migrated,
 * no provider is connected, the user hasn't dismissed it yet, and every signal
 * has resolved. A fresh (non-migrated) install fails `migrated`; the moment a
 * provider connects it fails `hasProvider`; once dismissed it fails `dismissed`
 * — so it can only ever fire once, at the right moment.
 */
export function shouldShowMigrationReconnect(
  i: MigrationReconnectInputs,
): boolean {
  if (i.loading) return false;
  if (!i.newEngine) return false;
  if (!i.coLocated) return false;
  if (!i.migrated) return false;
  if (i.hasProvider) return false;
  if (i.dismissed) return false;
  return true;
}
