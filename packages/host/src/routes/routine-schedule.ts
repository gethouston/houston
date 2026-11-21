import {
  canonicalSchedule,
  getPreference,
  resolveTimezone,
  validateSchedule,
} from "@houston/domain";
import type { Vfs } from "../vfs";

export async function checkedSchedule(
  vfs: Vfs,
  workspaceId: string,
  schedule: string,
  timezone?: string,
): Promise<{ schedule: string } | { error: string }> {
  const canonical = canonicalSchedule(schedule);
  const accountTz = resolveTimezone(
    timezone ?? (await getPreference(vfs, workspaceId, "timezone")),
  );
  const err = validateSchedule(canonical, accountTz);
  return err ? { error: `invalid schedule: ${err}` } : { schedule: canonical };
}
