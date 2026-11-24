import type { UnsavedFilesReport } from "@houston/protocol";
import type {
  HydrateManifest,
  SyncMerge,
} from "@houston/runtime-client/object-sync";
import { turnActivityKey } from "./turn-filesystem-scope";
import { turnUnsavedFiles, type UnsavedSyncInput } from "./turn-unsaved-files";

/** What a turn's sync-back could not land, for the terminal frame. */
export interface TurnSyncReport {
  /** Keys left un-landed: generation conflicts that outlived every merge
   *  round, and files over the store's per-object cap. */
  incomplete?: { conflicts: string[]; skipped: string[] };
  /** Merged documents that lost a first race, with the rounds each took and
   *  the board card ids a landed merge removed (a drop is visible here). */
  merges?: SyncMerge[];
  /** The agent's board (`activity.json`): landed this pass or not, and the
   *  bytes that landed when the pass verified them against the upload. */
  board: { landed: boolean; mergeAttempts?: number; body?: string };
  unsavedFiles?: UnsavedFilesReport;
}

/** Summarize one sync-back pass, singling out the agent's board. */
export function turnSyncReport(
  synced: UnsavedSyncInput & {
    uploaded: readonly string[];
    merges: readonly SyncMerge[];
    /** The pass's next manifest: a landed board's entry keeps its bytes. */
    manifest?: HydrateManifest;
  },
  workspaceRel: string,
): TurnSyncReport {
  const boardKey = turnActivityKey(workspaceRel);
  const incomplete =
    synced.conflicts.length > 0 || synced.skipped.length > 0
      ? {
          conflicts: synced.conflicts.map(({ key }) => key),
          skipped: synced.skipped.map(({ key }) => key),
        }
      : undefined;
  const boardMerge = synced.merges.find(({ key }) => key === boardKey);
  const landed = synced.uploaded.includes(boardKey);
  const body = landed ? synced.manifest?.get(boardKey)?.mergeBase : undefined;
  const unsavedFiles = turnUnsavedFiles(synced, workspaceRel);
  return {
    ...(incomplete ? { incomplete } : {}),
    ...(synced.merges.length > 0 ? { merges: [...synced.merges] } : {}),
    board: {
      landed,
      ...(boardMerge ? { mergeAttempts: boardMerge.attempts } : {}),
      ...(body === undefined ? {} : { body }),
    },
    ...(unsavedFiles ? { unsavedFiles } : {}),
  };
}
