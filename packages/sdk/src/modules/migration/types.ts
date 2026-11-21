import type { UploadOptions } from "../files/types";

export interface MigrationImportOptions extends UploadOptions {
  overwrite?: boolean;
  sessions?: boolean;
}

export interface MigrationImportResult {
  written: number;
  skipped: number;
  rejected: { path: string; reason: string }[];
  sessionsRebuilt: boolean;
}

export interface MigrationCounts {
  written: number;
  skipped: number;
  rejected: number;
  sessionsRebuilt: boolean;
}

export interface MigrationSource {
  workspace: string;
  agent: string;
}

export interface MigrationMarker {
  completedAt: string;
  source: MigrationSource | null;
  counts: MigrationCounts | null;
}
