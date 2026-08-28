import { mkdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { docKey } from "@houston/domain";
import { MAX_UPLOAD_BYTES } from "@houston/host/src/turn/files-import";
import { FsVfs, LazyStoreVfs, type Vfs } from "@houston/host/src/vfs";
import {
  DEFAULT_EXCLUDES,
  HydrateLimitError,
  type HydrateManifest,
  hydrate,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { agentScopeIncludes } from "./turn-agent-scope";
import {
  layoutSkeleton,
  resolveTurnLayout,
  type TurnLayout,
  TurnSetupError,
} from "./turn-layout";

/** Maximum hydrated bytes accepted by a pooled turn. */
export const TURN_HYDRATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Hydrated manifest paired with the resolved on-disk layout. */
export interface TurnFilesystem extends TurnLayout {
  storeRoot: string;
  /** Sync-back ownership: objects on disk (and, lazily, objects owned
   *  without a download). A lazy tree grows this as handlers read. */
  manifest: HydrateManifest;
  /** Reads rooted at `storeRoot`: the real tree when hydrated, the
   *  store-backed overlay when lazy. Readers that may touch an object the
   *  op did not materialize (doc republish) go through this, never `fs`. */
  vfs: Vfs;
  /** Remote objects the lazy listing knows about (diagnostics). */
  listedObjects: number;
  /** The store's generation capability as the LISTING showed it. A filtered
   *  or lazy manifest may be empty and cannot answer this on its own. */
  generationAware: boolean;
  /** Tool-call-time CAS writes already durable before the final sync pass. */
  immediateWrites: Set<string>;
}

/**
 * Hydrate an isolated store tree and resolve the layout it contains. Only a
 * CLAIMED (pool) turn gets the pool's 2 GiB cap; an unclaimed turn keeps
 * hydrate's own default so a deployment without the pool env behaves exactly
 * as before.
 */
export async function prepareTurnFilesystem(opts: {
  store: ObjectStore;
  prefix: string;
  root: string;
  claimed: boolean;
  maxBytes?: number;
  /** Extra hydrate excludes (on top of the defaults), e.g. the runtime tree
   *  for an op that never reads conversations. */
  excludes?: string[];
  /** Per-object hot-set admission on top of the excludes. */
  filter?: (rel: string) => boolean;
  /**
   * Download nothing up front: list the store, lay out the agent's
   * directory skeleton, and serve reads through a store-backed vfs that
   * materializes one object on first touch. Needs a store with a manifest
   * (a legacy list-only store hydrates eagerly). Only for handlers that
   * read through the vfs port; a turn's tools read the real filesystem.
   */
  lazy?: boolean;
}): Promise<TurnFilesystem> {
  const storeRoot = join(opts.root, "store");
  await mkdir(storeRoot, { recursive: true });
  const excludes = opts.excludes
    ? [...DEFAULT_EXCLUDES, ...opts.excludes]
    : DEFAULT_EXCLUDES;
  const maxBytes =
    opts.maxBytes ?? (opts.claimed ? TURN_HYDRATE_MAX_BYTES : undefined);
  if (opts.lazy && opts.store.manifest) {
    const objects = await opts.store.manifest(opts.prefix);
    const manifest: HydrateManifest = new Map();
    const vfs = new LazyStoreVfs({
      store: opts.store,
      prefix: opts.prefix,
      root: storeRoot,
      objects,
      manifest,
      excludes,
      maxObjectBytes: MAX_UPLOAD_BYTES,
      maxBytes: maxBytes ?? TURN_HYDRATE_MAX_BYTES,
    });
    await layoutSkeleton(storeRoot, vfs.remoteKeys);
    return {
      ...(await resolveTurnLayout(storeRoot, { allowEmpty: !opts.claimed })),
      storeRoot,
      manifest,
      vfs,
      listedObjects: objects.length,
      generationAware: vfs.generationAware,
      immediateWrites: new Set(),
    };
  }
  let manifest: HydrateManifest;
  let listed = { rels: [] as string[], generationAware: false };
  try {
    manifest = await hydrate(opts.store, opts.prefix, storeRoot, {
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      excludes,
      ...(opts.filter ? { filter: opts.filter } : {}),
      onListed: (listing) => {
        listed = listing;
      },
    });
    // The layout must resolve from what the STORE holds, not from what the
    // filter admitted: a turn whose agent has nothing but other
    // conversations' history still targets an existing agent.
    await layoutSkeleton(storeRoot, listed.rels);
  } catch (error) {
    if (!(error instanceof HydrateLimitError)) throw error;
    throw new TurnSetupError("hydrate_over_cap", error.message);
  }
  return {
    ...(await resolveTurnLayout(storeRoot, { allowEmpty: !opts.claimed })),
    storeRoot,
    manifest,
    vfs: new FsVfs(storeRoot),
    listedObjects: listed.rels.length,
    generationAware: listed.generationAware,
    immediateWrites: new Set(),
  };
}

/**
 * Build a claimed turn's write scope: its own conversation, session, the two
 * granted docs, and the agent's workspace FILES. Workspace files are the
 * turn's deliverable — a spreadsheet the agent built, a document it edited
 * (via the clamped file tools or, on a single-use worker, bash) must survive
 * sync-back or the work silently vanishes. Everything else under `.houston/`
 * stays out of scope: runtime data, docs, and credentials belong to their own
 * writers, and two concurrent conversations of one agent must not clobber
 * them from here. Concurrent workspace-file writes from two conversations of
 * the same agent are last-writer-wins per object, same as the standing host's
 * store-sync daemon.
 */
export function claimedTurnIncludes(
  dataRel: string,
  workspaceRel: string,
  conversationId: string,
): (relativePath: string) => boolean {
  const conversation = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(conversationId)}.json`,
  );
  const session = posix.join(dataRel, "sessions", conversationId);
  const activity = turnActivityKey(workspaceRel);
  const runs = turnRoutineRunsKey(workspaceRel);
  return (relativePath) =>
    relativePath === conversation ||
    relativePath.startsWith(`${session}/`) ||
    relativePath === activity ||
    relativePath === runs ||
    agentScopeIncludes(relativePath, workspaceRel);
}

/** Store-relative mission-board object granted to a claimed turn. */
export const turnActivityKey = (workspaceRel: string): string =>
  docKey(workspaceRel, "activity");

/** Store-relative routine-runs object granted to a claimed turn. */
export const turnRoutineRunsKey = (workspaceRel: string): string =>
  docKey(workspaceRel, "routine_runs");

/** Sync a turn, limiting a claimed writer to its granted turn-owned files. */
export async function syncTurnFilesystem(opts: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  conversationId: string;
  claimed: boolean;
}): Promise<{
  uploaded: string[];
  deleted: string[];
  outOfScope: number;
  skipped: { key: string; reason: string }[];
  conflicts: { key: string; reason: string }[];
}> {
  const result = await syncBack(
    opts.store,
    opts.prefix,
    opts.filesystem.storeRoot,
    opts.filesystem.manifest,
    {
      generations: opts.filesystem.generationAware,
      // A single-use worker has no later retry — its temp tree is wiped after
      // the turn. A failed/oversized workspace-file upload must NOT then delete
      // the durable object it was replacing, so hold the delete pass whenever
      // any write was skipped or conflicted (turn durability surfaces it).
      holdDeletesOnFailure: opts.claimed,
      ...(opts.claimed
        ? {
            include: claimedTurnIncludes(
              opts.filesystem.dataRel,
              opts.filesystem.workspaceRel,
              opts.conversationId,
            ),
          }
        : {}),
    },
  );
  if (result.outOfScope > 0) {
    // Attributed: on a shared worker an unattributed count is unactionable.
    console.info(
      `[turn] pool_writes_out_of_scope=${result.outOfScope} prefix=${opts.prefix || opts.filesystem.dataRel} conversation=${opts.conversationId}`,
    );
  }
  if (result.skipped.length > 0 || result.conflicts.length > 0) {
    console.warn(
      `[turn] pool_sync_incomplete skipped=${result.skipped.length} conflicts=${result.conflicts.length} conversation=${opts.conversationId}`,
    );
  }
  return {
    uploaded: result.uploaded,
    deleted: result.deleted,
    outOfScope: result.outOfScope,
    skipped: result.skipped,
    conflicts: result.conflicts,
  };
}
