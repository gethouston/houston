import type {
  HydrateManifest,
  SyncMerge,
} from "@houston/runtime-client/object-sync";
import { turnActivityKey } from "./turn-filesystem-scope";

export interface TurnSyncReport {
  incomplete?: { conflicts: string[]; skipped: string[] };
  merges?: SyncMerge[];
  board: { landed: boolean; mergeAttempts?: number; body?: string };
}

export function turnSyncReport(
  synced: {
    uploaded: readonly string[];
    conflicts: readonly { key: string }[];
    skipped: readonly { key: string }[];
    merges: readonly SyncMerge[];
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
  return {
    ...(incomplete ? { incomplete } : {}),
    ...(synced.merges.length > 0 ? { merges: [...synced.merges] } : {}),
    board: {
      landed,
      ...(boardMerge ? { mergeAttempts: boardMerge.attempts } : {}),
      ...(body === undefined ? {} : { body }),
    },
  };
}
