/**
 * `os` category, first-run cloud migration (HOU-719). Native and desktop-only:
 * only the shell can read the OLD local install's `~/.houston` tree and spawn
 * the bundled host against it. The wizard exports each legacy agent over
 * loopback HTTP and uploads it to the cloud gateway.
 *
 * Its own module rather than part of `os.ts`: a self-contained one-way flow,
 * and `os.ts` is the largest category already.
 */

import type { LegacyDetection } from "../cloud-migration";
import { invokeNative } from "./invoke.ts";

/** Scan for legacy desktop data worth migrating. Fast, read-only. */
export function osDetectLegacyHouston(): Promise<LegacyDetection> {
  return invokeNative<LegacyDetection>("detect_legacy_houston");
}

export interface HoustonBackup {
  backupPath: string;
  fileCount: number;
  byteCount: number;
}

/** Make a full local backup of the user's Houston data before the cloud
 *  migration uploads it — a sibling copy named `<dir>-<timestamp>-backup`.
 *  Can block on a large tree (the copy runs on the blocking pool). Rejects
 *  with "nothing to back up" when there's no legacy data to copy. */
export function osBackupHoustonData(): Promise<HoustonBackup> {
  return invokeNative<HoustonBackup>("backup_houston_data");
}

/** Spawn (or return the already-running) passive migration-source host against
 *  the legacy tree. Can block for MINUTES — its boot converts a big chat db
 *  before the banner prints — so callers show a "preparing" state. Idempotent. */
export function osStartMigrationSourceHost(): Promise<{
  baseUrl: string;
  token: string;
}> {
  return invokeNative<{ baseUrl: string; token: string }>(
    "start_migration_source_host",
  );
}

/** Kill the migration-source host. Idempotent — absent is success. */
export function osStopMigrationSourceHost(): Promise<void> {
  return invokeNative<void>("stop_migration_source_host");
}
