/**
 * Pure trigger logic for the one-time post-migration "reconnect your AI"
 * moment, kept free of React + engine imports so it is unit-testable directly
 * (see `use-migration-reconnect.test.mjs`). The hook in
 * `use-migration-reconnect.ts` gathers the signals and delegates the decision
 * here.
 */

/** Inputs to the "reconnect your AI" decision. */
export interface MigrationReconnectInputs {
  /** Active backend is the new TS host (the only build that migrates). */
  newEngine: boolean;
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
  if (!i.migrated) return false;
  if (i.hasProvider) return false;
  if (i.dismissed) return false;
  return true;
}
