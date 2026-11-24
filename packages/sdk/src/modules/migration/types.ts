import type { UploadOptions } from "../files/types";

/** How an import chunk lands on the target agent. */
export interface MigrationImportOptions extends UploadOptions {
  /** Replace files the target already has (a retry over a partial first try). */
  overwrite?: boolean;
  /** `false`: write the transcripts but rebuild no pi session from them; the
   *  caller stamps `needsSessionReplay` on the transcripts instead so the
   *  next turn replays the history into whichever backend runs it. */
  sessions?: boolean;
}

/** One import request's outcome on the agent-scoped migration route. */
export interface MigrationImportResult {
  written: number;
  skipped: number;
  rejected: { path: string; reason: string }[];
  /** False when the deployment has no on-disk agent dir to anchor chat sessions. */
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
