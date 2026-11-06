import {
  canonicalSchedule,
  getPreference,
  validateSchedule,
} from "@houston/domain";
import type { Vfs } from "../vfs";

/**
 * The schedule a routine write persists, or why it is refused. An `@every`
 * interval whose count divides its unit is stored as the cron older readers
 * already understand (`@every 30m` -> `*\/30 * * * *`); an uneven one keeps the
 * interval form. A bad schedule is refused NOW, because a saved one silently
 * never fires. Cron is validated in the single account-wide zone (HOU-470):
 * there is no per-routine timezone.
 */
export async function checkedSchedule(
  vfs: Vfs,
  workspaceId: string,
  schedule: string,
  timezone?: string,
): Promise<{ schedule: string } | { error: string }> {
  const canonical = canonicalSchedule(schedule);
  const accountTz =
    timezone ?? (await getPreference(vfs, workspaceId, "timezone"));
  const err = validateSchedule(canonical, accountTz);
  return err ? { error: `invalid schedule: ${err}` } : { schedule: canonical };
}
