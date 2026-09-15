/**
 * Wire types for the migration module — what one import chunk may ask for, and
 * what the target reports it did with it.
 *
 * There is no command vocabulary here, unlike every other plain-async module.
 * Both operations carry a zip archive as raw bytes and the bridge's `dispatch`
 * path is plain JSON end to end, so a native shell moves an agent's data with
 * its own file transport rather than through a command that could not hold the
 * archive.
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
