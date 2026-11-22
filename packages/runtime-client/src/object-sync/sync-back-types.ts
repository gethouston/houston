import type { HydrateManifest } from "./hydrate";
import type { ConflictBackoff } from "./sync-back-merge-retry";

/** A merged document that lost a first race (worker stores only). */
export interface SyncMerge {
  key: string;
  attempts: number;
  removedCards?: string[];
  /** A side would not parse as the document: the local bytes overwrote the
   *  remote, as before merges existed. The parse or shape error. */
  unmergeable?: string;
}

export interface SyncResult {
  uploaded: string[];
  deleted: string[];
  manifest: HydrateManifest;
  /**
   * Files the store REJECTED as over its per-object cap (typed 413). They stay
   * local-only: recorded in the manifest at their current hash so the pass
   * completes and the upload is re-attempted only when the file changes —
   * never as an every-tick retry of a deterministic verdict.
   */
  skipped: { key: string; reason: string }[];
  /**
   * Per-object generation conflicts (typed 412) that survived one refreshed
   * retry. The pass continues past them; a FENCE rejection (409) aborts it
   * instead — that pod is no longer the writer, and every further write would
   * be garbage.
   */
  conflicts: { key: string; reason: string }[];
  /** Merged documents that lost a first race, with the merge rounds each
   *  took (landed or not: a conflict entry names the ones that never did)
   *  and the board cards a landed merge removed from the remote. */
  merges: SyncMerge[];
  /** Changed paths rejected by the caller's write scope. */
  outOfScope: number;
  outOfScopeKeys: string[];
  conflictCopies: { key: string; copy: string }[];
  deletesKept: { key: string; reason: string }[];
  /** Bytes the next hydration must materialize, excluding local-only paths. */
  totalBytes: number;
}

/**
 * Serialize a merge's rewrite of a local document with that document's own
 * writers. Without it a writer's load→save that spans the rewrite saves over
 * the merged rows (or the rewrite drops the save).
 */
export type LocalWriteLock = <T>(
  relativePath: string,
  write: () => Promise<T>,
) => Promise<T>;

/** Caller policy for exclusions, generations, and permitted write paths. */
export interface SyncBackOptions {
  excludes?: string[];
  generations?: boolean;
  /** Limit writes and deletes while still detecting skipped changes. */
  include?: (relativePath: string) => boolean;
  /**
   * Skip the delete pass entirely when any upload was skipped or conflicted.
   * A rename/move uploads the new key and deletes the old one; if the upload
   * is refused (over the store's cap, a conflict) the delete would destroy
   * the ONLY durable copy. One-shot callers (a pool op) set this; the
   * standing daemon retries on its next tick and keeps the default.
   */
  holdDeletesOnFailure?: boolean;
  /**
   * The per-turn worker's conflict handling: merged documents (the board
   * included) re-merge over bounded rounds, the board keeps its merge base.
   * Off for the standing store sync, which retries every conflict once at the
   * refreshed generation and never merges the board.
   */
  workerMerge?: boolean;
  conflictCopies?: (relativePath: string) => boolean;
  /** Delay between merge rounds of a contended document (tests pass 0). */
  conflictBackoff?: ConflictBackoff;
  /** The standing daemon's hold on the host's writers of a merged document. */
  localWriteLock?: LocalWriteLock;
}
