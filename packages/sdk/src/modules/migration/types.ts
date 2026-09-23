/**
 * Wire types for the migration module — what one import chunk may ask for, and
 * what the target reports it did with it.
 *
 * There is no command vocabulary here, unlike every other plain-async module.
 * Both operations carry a zip archive as raw bytes and the `dispatch` path is
 * plain JSON end to end, so the typed facade carries the archive itself rather
 * than a command that could not hold it.
 */

/** How an import chunk lands on the target agent. */
export interface MigrationImportOptions {
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

/** The counters one agent's chunks accumulated, as the marker records them. */
export interface MigrationCounts {
  written: number;
  skipped: number;
  rejected: number;
  sessionsRebuilt: boolean;
}

/** Which agent on which deployment this agent's data came from. */
export interface MigrationSource {
  workspace: string;
  agent: string;
}

/**
 * The server-authoritative "this agent was imported" marker.
 *
 * `source` and `counts` are nullable because the route writes what the caller
 * sent through verbatim (`body.source ?? null`): a marker stamped by an older
 * caller, or by one that sent neither, still says WHEN the import completed.
 */
export interface MigrationMarker {
  completedAt: string;
  source: MigrationSource | null;
  counts: MigrationCounts | null;
}
