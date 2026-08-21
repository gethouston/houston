import { mkdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { docKey } from "@houston/domain";
import {
  DEFAULT_EXCLUDES,
  HydrateLimitError,
  type HydrateManifest,
  hydrate,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import {
  resolveTurnLayout,
  type TurnLayout,
  TurnSetupError,
} from "./turn-layout";

/** Maximum hydrated bytes accepted by a pooled turn. */
export const TURN_HYDRATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Hydrated manifest paired with the resolved on-disk layout. */
export interface TurnFilesystem extends TurnLayout {
  storeRoot: string;
  manifest: HydrateManifest;
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
}): Promise<TurnFilesystem> {
  const storeRoot = join(opts.root, "store");
  await mkdir(storeRoot, { recursive: true });
  const maxBytes =
    opts.maxBytes ?? (opts.claimed ? TURN_HYDRATE_MAX_BYTES : undefined);
  let manifest: HydrateManifest;
  try {
    manifest = await hydrate(opts.store, opts.prefix, storeRoot, {
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(opts.excludes
        ? { excludes: [...DEFAULT_EXCLUDES, ...opts.excludes] }
        : {}),
    });
  } catch (error) {
    if (!(error instanceof HydrateLimitError)) throw error;
    throw new TurnSetupError("hydrate_over_cap", error.message);
  }
  return {
    ...(await resolveTurnLayout(storeRoot, { allowEmpty: !opts.claimed })),
    storeRoot,
    manifest,
  };
}

/** Build the exact conversation, session, and activity-doc write scope. */
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
    relativePath === runs;
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
}): Promise<{ uploaded: string[]; outOfScope: number }> {
  const result = await syncBack(
    opts.store,
    opts.prefix,
    opts.filesystem.storeRoot,
    opts.filesystem.manifest,
    opts.claimed
      ? {
          include: claimedTurnIncludes(
            opts.filesystem.dataRel,
            opts.filesystem.workspaceRel,
            opts.conversationId,
          ),
        }
      : {},
  );
  if (result.outOfScope > 0) {
    // Attributed: on a shared worker an unattributed count is unactionable.
    console.info(
      `[turn] pool_writes_out_of_scope=${result.outOfScope} prefix=${opts.prefix || opts.filesystem.dataRel} conversation=${opts.conversationId}`,
    );
  }
  return { uploaded: result.uploaded, outOfScope: result.outOfScope };
}
