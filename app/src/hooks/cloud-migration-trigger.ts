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

/** The wizard's persisted outcome, keyed per Supabase user in localStorage —
 *  the legacy data is machine-local, so the flag is too. */
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
  /** This user already finished or declined the wizard on this machine. */
  outcome: CloudMigrationOutcome | null;
  /**
   * The AUTHORITATIVE, cross-machine gate from the user's Supabase metadata
   * (`readMigrated`): `true` = done (migrated, or a new user past onboarding),
   * `false` = an existing user marked for migration, `null` = a brand-new cloud
   * user. Only an explicit `false` is ever a wizard candidate; `true` and
   * absent both fall straight through to the app / onboarding.
   */
  migrated: boolean | null;
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
  // Authoritative cross-machine metadata gate. `true` (migrated, or a new user
  // past onboarding) and `null` (a brand-new cloud user → normal onboarding)
  // both pass; ONLY an explicit `false` marks a migration candidate. This is
  // what lets "absent = new": the whole existing base is backfilled to `false`.
  if (i.migrated !== false) return "pass";
  if (i.outcome) return "pass";
  if (i.loading) return "loading";
  // Marked for migration, but the data is machine-local: only surface the
  // wizard where a `~/.houston` actually exists. A marked user on a fresh
  // machine keeps `migrated:false` and migrates on the device that holds it.
  return i.hasLegacyWorkspaces ? "show" : "pass";
}
