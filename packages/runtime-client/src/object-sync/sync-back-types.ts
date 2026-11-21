import type { HydrateManifest } from "./hydrate";
import type { ConflictBackoff } from "./sync-back-merge-retry";

export interface SyncMerge {
  key: string;
  attempts: number;
  removedCards?: string[];
  unmergeable?: string;
}

export interface SyncResult {
  uploaded: string[];
  deleted: string[];
  manifest: HydrateManifest;
  skipped: { key: string; reason: string }[];
  conflicts: { key: string; reason: string }[];
  merges: SyncMerge[];
  outOfScope: number;
  totalBytes: number;
}

export type LocalWriteLock = <T>(
  relativePath: string,
  write: () => Promise<T>,
) => Promise<T>;

export interface SyncBackOptions {
  excludes?: string[];
  generations?: boolean;
  include?: (relativePath: string) => boolean;
  holdDeletesOnFailure?: boolean;
  workerMerge?: boolean;
  conflictBackoff?: ConflictBackoff;
  localWriteLock?: LocalWriteLock;
}
