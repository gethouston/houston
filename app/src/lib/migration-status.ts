import type { Session } from "@supabase/supabase-js";
import { reportError } from "./error-toast";
import { supabase } from "./supabase";

/**
 * The user's cloud-migration state, stored on their Supabase user metadata
 * (HOU-719). This is the AUTHORITATIVE, cross-machine record of whether the
 * one-click migration has completed for this account:
 *
 *  - absent / "pending" — never migrated (or a fresh account).
 *  - "in_progress"       — a run started but hasn't finished (crash / quit
 *                          mid-run leaves this; the wizard can resume it).
 *  - "completed"         — the migration finished successfully; never offer it
 *                          again on any machine.
 *  - "failed"            — a run errored out; the user can retry from Settings.
 *
 * Local `localStorage` (per machine) is only a fast hint; this metadata is the
 * source of truth for "already migrated", so a user who migrated on one machine
 * isn't offered the wizard again on another.
 */
export type MigrationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

const KNOWN = new Set<MigrationStatus>([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

/** Read the migration status off a Supabase session, or `null` when unset. */
export function readMigrationStatus(
  session: Session | null | undefined,
): MigrationStatus | null {
  const raw = session?.user?.user_metadata?.migration_status;
  return typeof raw === "string" && KNOWN.has(raw as MigrationStatus)
    ? (raw as MigrationStatus)
    : null;
}

/**
 * Write the migration status to the signed-in user's metadata. Best-effort:
 * a failure is reported (never silent) but doesn't block the flow — the local
 * outcome flag still gates the wizard for this session, and the next
 * successful write reconciles the account.
 */
export async function writeMigrationStatus(
  status: MigrationStatus,
): Promise<void> {
  try {
    const { error } = await supabase.auth.updateUser({
      data: { migration_status: status },
    });
    if (error) throw error;
  } catch (e) {
    reportError(
      "cloud_migration_status_write",
      e instanceof Error ? e.message : String(e),
      e,
    );
  }
}

/**
 * The single top-level cloud-migration GATE on the user's Supabase metadata
 * (HOU-719), a plain boolean that decides which first-run surface a signed-in
 * desktop user sees:
 *
 *   - `true`  — done: migrated (or a brand-new user who finished onboarding).
 *               Never show onboarding OR the migration wizard again.
 *   - `false` — an existing local-app user marked for migration. The wizard is
 *               offered on whichever machine still holds their `~/.houston`.
 *   - absent  — a brand-new user who only ever downloaded the cloud app; they
 *               go through normal onboarding.
 *
 * The whole existing user base is backfilled to `false` at cutover, so "absent"
 * can reliably mean "new". `migration_status` above stays the finer-grained
 * resume/retry detail; `migrated` is the authoritative on/off switch the gate
 * reads.
 */
export function readMigrated(
  session: Session | null | undefined,
): boolean | null {
  const raw = session?.user?.user_metadata?.migrated;
  return typeof raw === "boolean" ? raw : null;
}

/** Write the `migrated` gate flag to the signed-in user's metadata.
 *  Best-effort, mirroring `writeMigrationStatus` — a failure is reported, never
 *  silent, and the next successful write reconciles the account. */
export async function writeMigrated(value: boolean): Promise<void> {
  try {
    const { error } = await supabase.auth.updateUser({
      data: { migrated: value },
    });
    if (error) throw error;
  } catch (e) {
    reportError(
      "cloud_migration_migrated_write",
      e instanceof Error ? e.message : String(e),
      e,
    );
  }
}
