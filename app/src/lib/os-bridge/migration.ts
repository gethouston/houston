import type { LegacyDetection } from "../cloud-migration";
import { invokeNative } from "./invoke.ts";

export function osDetectLegacyHouston(): Promise<LegacyDetection> {
  return invokeNative<LegacyDetection>("detect_legacy_houston");
}

export interface HoustonBackup {
  backupPath: string;
  fileCount: number;
  byteCount: number;
}

export function osBackupHoustonData(): Promise<HoustonBackup> {
  return invokeNative<HoustonBackup>("backup_houston_data");
}

export function osStartMigrationSourceHost(): Promise<{
  baseUrl: string;
  token: string;
}> {
  return invokeNative<{ baseUrl: string; token: string }>(
    "start_migration_source_host",
  );
}

export function osStopMigrationSourceHost(): Promise<void> {
  return invokeNative<void>("stop_migration_source_host");
}
