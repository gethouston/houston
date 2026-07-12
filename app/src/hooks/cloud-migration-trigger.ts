/**
 * Pure trigger logic for the first-run cloud-migration wizard (HOU-719), kept
 * free of React + engine imports so it is unit-testable directly (see
 * `app/tests/cloud-migration-trigger.test.ts`). The hook in
 * `use-cloud-migration.ts` gathers the signals and delegates the decision here.
 *
 * Distinct from `migration-reconnect-trigger.ts` (the CO-LOCATED "reconnect
 * your AI" moment after an in-place upgrade): this gate is the opposite
 * topology — a REMOTE gateway build finding the machine's OLD local data.
 */

/** The wizard's persisted outcome, keyed per signed-in user (identity uid) in
 *  localStorage — the legacy data is machine-local, so the flag is too. */
export type CloudMigrationOutcome = "done" | "skipped";

export interface CloudMigrationInputs {
  /**
   * The active engine is a remote gateway (`hosted-oauth` or `hosted-static`).
   * The wizard imports into cloud agents, so it must NEVER show against the
   * local sidecar or an external dev host URL — there is nothing to migrate to.
   */
  remoteGateway: boolean;
  /** Running inside the Tauri desktop shell — only it can read the old
   *  `~/.houston` tree and spawn the migration source host. */
  isTauri: boolean;
  /** A signed-in identity exists to key the persisted outcome on. */
  signedIn: boolean;
  /** `detect_legacy_houston` found legacy workspaces with agents. */
  hasLegacyWorkspaces: boolean;
  /**
   * This user already finished ("done") or declined ("skipped") the wizard on
   * this machine — the persisted per-uid localStorage flag. The migration reads
   * THIS machine's `~/.houston`, so the record is machine-local: identity
   * (Firebase) exposes no client-writable user metadata for a cross-machine
   * "already migrated" flag (unlike the retired Supabase `user_metadata`).
   * Cross-machine RESUME still holds — the gateway's per-agent import markers
   * mark already-migrated agents `alreadyDone` on any machine.
   */
  outcome: CloudMigrationOutcome | null;
  /** The detection probe is still in flight. */
  loading: boolean;
}

export type CloudMigrationGateState = "loading" | "show" | "pass";

/**
 * The single source of truth for the wizard gate. `pass` renders the app as
 * usual; `show` renders the wizard; `loading` holds a splash — only reachable
 * once every cheap gate holds — so a migrating user never flashes into the
 * create-your-assistant onboarding while the detection probe resolves.
 */
export function cloudMigrationGateState(
  i: CloudMigrationInputs,
): CloudMigrationGateState {
  if (!i.remoteGateway) return "pass";
  if (!i.isTauri) return "pass";
  if (!i.signedIn) return "pass";
  // A machine that already finished or declined the wizard never sees it again
  // (per-uid localStorage). The migration is inherently machine-scoped — it
  // reads this machine's `~/.houston` — so this per-machine flag is the gate.
  if (i.outcome) return "pass";
  if (i.loading) return "loading";
  return i.hasLegacyWorkspaces ? "show" : "pass";
}
