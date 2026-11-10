import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import {
  DEFAULT_EXCLUDES,
  type HydrateOptions,
  startHydrate,
} from "@houston/runtime-client/object-sync";
import { turnArchiveLoader } from "./turn-archive-fetch";
import { watchDeferredFiles } from "./turn-deferred-watch";
import { startLazyTurnFilesystem } from "./turn-filesystem-lazy";
import type {
  TurnFilesystem,
  TurnFilesystemOptions,
  TurnFilesystemPreparation,
} from "./turn-filesystem-types";
import { turnHydrationError } from "./turn-hydration-error";
import {
  resolveListedLayout,
  type TurnLayout,
  TurnSetupError,
} from "./turn-layout";
import { assertMigratedLayout } from "./turn-layout-legacy";
import { turnHydrationPriorityIncludes } from "./turn-runtime";

export {
  claimedTurnIncludes,
  turnActivityKey,
  turnRoutineRunsKey,
  turnSessionScopeIncludes,
} from "./turn-filesystem-scope";
export { syncTurnFilesystem } from "./turn-filesystem-sync";
export type {
  TurnFilesystem,
  TurnFilesystemPreparation,
} from "./turn-filesystem-types";

/** Maximum bytes a pooled turn hydrates before its prompt starts. */
export const TURN_HYDRATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Maximum bytes of the agent's own files a pooled turn loads behind the
 *  prompt (turn-deferred-rule.ts). Apart from the startup cap: a person's
 *  documents never decide whether the agent can answer. Sized with the
 *  startup cap inside a pool sandbox's disk (22 GB, measured). */
export const TURN_DEFERRED_MAX_BYTES = 8 * 1024 * 1024 * 1024;

/** Hydrate an isolated store tree and resolve its layout. Claimed turns use
 *  the pool's 2 GiB cap; unclaimed turns keep hydrate's default. */
export async function prepareTurnFilesystem(
  opts: TurnFilesystemOptions,
): Promise<TurnFilesystem> {
  return (await startTurnFilesystem(opts)).hydrated;
}

/** Resolve the listed layout, then hydrate runtime inputs before the bulk tree. */
export async function startTurnFilesystem(
  opts: TurnFilesystemOptions & {
    /** Eager trees only: keep these out of `hydrated` (`workspaceReady`). */
    defer?: HydrateOptions["defer"];
    /** Claimed turns default to TURN_DEFERRED_MAX_BYTES. */
    deferredMaxBytes?: number;
    deferredReadTimeoutMs?: number;
    deferredParallel?: number;
    timings?: Record<string, number>;
  },
): Promise<TurnFilesystemPreparation> {
  const storeRoot = join(opts.root, "store");
  await mkdir(storeRoot, { recursive: true });
  const excludes = opts.excludes
    ? [...DEFAULT_EXCLUDES, ...opts.excludes]
    : DEFAULT_EXCLUDES;
  const maxBytes =
    opts.maxBytes ?? (opts.claimed ? TURN_HYDRATE_MAX_BYTES : undefined);
  const deferredMaxBytes =
    opts.deferredMaxBytes ??
    (opts.claimed ? TURN_DEFERRED_MAX_BYTES : undefined);
  if (opts.lazy && opts.store.manifest) {
    const listed = await opts.store.manifest(opts.prefix);
    if (opts.timings) opts.timings.t_listing = performance.now();
    const filesystem = await startLazyTurnFilesystem({
      store: opts.store,
      listed,
      prefix: opts.prefix,
      storeRoot,
      claimed: opts.claimed,
      excludes,
      maxBytes: maxBytes ?? TURN_HYDRATE_MAX_BYTES,
      ...(opts.admit ? { admit: opts.admit } : {}),
      ...(opts.allowLegacyLayout ? { allowLegacyLayout: true } : {}),
      ...(opts.timings ? { timings: opts.timings } : {}),
    });
    return {
      filesystem,
      hydrated: Promise.resolve(filesystem),
      settled: Promise.resolve({ ok: true, filesystem }),
      abortHydration: () => undefined,
    };
  }
  let layout: TurnLayout | undefined;
  try {
    const started = await startHydrate(opts.store, opts.prefix, storeRoot, {
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      excludes,
      keepMergeBase: true,
      ...(opts.listing ? { listing: opts.listing } : {}),
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.capListed ? { capListed: true } : {}),
      ...(opts.defer ? { defer: opts.defer } : {}),
      ...(opts.defer && deferredMaxBytes !== undefined
        ? { deferredMaxBytes }
        : {}),
      ...(opts.deferredReadTimeoutMs !== undefined
        ? { deferredReadTimeoutMs: opts.deferredReadTimeoutMs }
        : {}),
      ...(opts.deferredParallel !== undefined
        ? { deferredParallel: opts.deferredParallel }
        : {}),
      priority: (rel) =>
        turnHydrationPriorityIncludes(
          layout?.dataRel,
          rel,
          opts.filter !== undefined,
        ),
      onListed: async (listing) => {
        if (opts.timings) opts.timings.t_listing = performance.now();
        layout = await resolveListedLayout(storeRoot, listing.rels, {
          allowEmpty: !opts.claimed,
        });
        if (opts.claimed && !opts.allowLegacyLayout)
          assertMigratedLayout(layout, listing.rels);
        if (opts.timings) opts.timings.t_layout = performance.now();
      },
    });
    if (!layout) {
      started.abort();
      await Promise.allSettled([started.deferred]);
      throw new TurnSetupError(
        "layout_unexpected",
        "turn layout did not resolve from the store listing",
      );
    }
    if (opts.timings) opts.timings.t_startup_files = performance.now();
    const watched = opts.defer
      ? watchDeferredFiles(started.deferred, started.abort, opts.timings)
      : undefined;
    const workspaceReady = watched?.workspaceReady;
    const filesystem: TurnFilesystem = {
      ...layout,
      storeRoot,
      manifest: started.manifest,
      vfs: new FsVfs(storeRoot),
      listedObjects: started.listed.rels.length,
      skippedObjects: started.skippedObjects,
      generationAware: started.listed.generationAware,
      immediateWrites: new Set(),
      ...(watched ? watched : {}),
      loadArchive: turnArchiveLoader({
        store: opts.store,
        prefix: opts.prefix,
        storeRoot,
        dataRel: layout.dataRel,
        manifest: started.manifest,
        maxBytes: maxBytes ?? TURN_HYDRATE_MAX_BYTES,
      }),
    };
    const hydrated = started.done.then(
      () => filesystem,
      (error: unknown) => {
        throw turnHydrationError(error);
      },
    );
    const settled = Promise.all([hydrated, workspaceReady]).then(
      () => ({ ok: true as const, filesystem }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    return {
      filesystem,
      hydrated,
      settled,
      abortHydration: started.abort,
    };
  } catch (error) {
    throw turnHydrationError(error);
  }
}
