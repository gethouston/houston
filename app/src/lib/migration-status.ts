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
