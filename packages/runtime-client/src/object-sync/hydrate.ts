import { basename, sep } from "node:path";
import {
  downloadHydrationEntries,
  type HydrateDownloadState,
  type HydrateEntry,
} from "./hydrate-download";
import type { ObjectStore } from "./object-store";

/**
 * Durable engine state is materialized into a local cache, then synchronized
 * back by content hash. The hydration manifest is the ownership boundary: only
 * objects observed on hydrate may be interpreted as locally deleted later.
 * Authentication material and temporary files never cross this boundary.
 */

export interface HydrateManifestEntry {
  hash: string;
  generation?: string;
}

/** Relative path to the hydrated bytes and their optional remote generation. */
export type HydrateManifest = Map<string, HydrateManifestEntry>;

export const DEFAULT_EXCLUDES = ["data/auth.json"];

const norm = (rel: string) => rel.split(sep).join("/");

function segmentGlobMatches(pattern: string, path: string): boolean {
  const subtree = pattern.endsWith("/");
  const want = (subtree ? pattern.slice(0, -1) : pattern).split("/");
  const have = path.split("/");
  if (subtree ? have.length < want.length : have.length !== want.length) {
    return false;
  }
  return want.every((seg, i) => seg === "*" || seg === have[i]);
}

export function excluded(rel: string, excludes: string[]): boolean {
  const normalized = norm(rel);
  if (normalized.endsWith(".tmp")) return true;
  if (normalized.endsWith(".houston/runtime/auth.json")) return true;
  // Per-member credential files. Their directory's depth differs per deployment
  // (`<agent>/.houston/runtime/auth-users/` on a standing pod, `data/auth-users/`
  // in the per-turn layout), so it must be matched by SEGMENT the same way
  // auth.json is matched by suffix — a root-relative pattern misses the real
  // key. Unconditional, not caller-configurable: this is credential material,
  // and one member's tokens reaching the shared store leaks them to the space.
  if (normalized.split("/").includes("auth-users")) return true;
  return excludes.some((exclude) => {
    const pattern = norm(exclude);
    if (pattern.includes("*")) {
      // Segment glob: `*` matches exactly one path segment; a trailing `/`
      // names a subtree. `workspaces/*/*/.houston/runtime/` is the agent's
      // own runtime dir at its fixed depth — never a user project's.
      return segmentGlobMatches(pattern, normalized);
    }
    if (pattern.endsWith("/")) {
      const subtree = pattern.slice(0, -1);
      return normalized === subtree || normalized.startsWith(pattern);
    }
    if (!pattern.includes("/")) return basename(normalized) === pattern;
    return normalized === pattern;
  });
}

export interface HydrateOptions {
  /** Reject prefixes whose total size exceeds this (default 512 MiB). */
  maxBytes?: number;
  excludes?: string[];
  /**
   * Concurrent downloads (default 16). Hydration gates the managed pod's
   * readiness, and one store round-trip per object (~80 ms through the pod
   * store) dominates cold wake time when it runs sequentially: a routine
   * 133-object workspace measured 10.5 s sequential vs 0.4 s at 16.
   */
  concurrency?: number;
  /**
   * Per-object admission on top of `excludes`: only objects the predicate
   * accepts are downloaded. Lets a caller hydrate a hot-set (one
   * conversation's files, not every conversation's) without a glob per id.
   */
  filter?: (rel: string) => boolean;
  /** Every admitted path BEFORE `filter` (the store's view of the tree) and
   *  whether the listing carried generations (the CAS capability, which a
   *  filtered manifest can no longer answer on its own). */
  onListed?: (listing: {
    rels: string[];
    generationAware: boolean;
  }) => void | Promise<void>;
  /** Download these admitted objects before the remaining hydration starts. */
  priority?: (rel: string) => boolean;
}

/** The hydrated prefix exceeded the caller's aggregate byte cap. */
export class HydrateLimitError extends Error {
  constructor(
    readonly maxBytes: number,
    readonly observedBytes: number,
  ) {
    super(
      `workspace exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB hydration limit`,
    );
    this.name = "HydrateLimitError";
  }
}

const DEFAULT_HYDRATE_CONCURRENCY = 16;

export interface StartedHydration {
  manifest: HydrateManifest;
  listed: { rels: string[]; generationAware: boolean };
  /** Resolves only after every non-priority object has landed. */
  done: Promise<void>;
}

/** List once, hydrate priority inputs, then start the remaining downloads. */
export async function startHydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<StartedHydration> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
  // Guard against a non-finite override (NaN sizes the worker array to ZERO,
  // which would return a successful empty manifest for a non-empty store —
  // the exact partial-manifest state the hydration latch exists to prevent).
  const requested = opts.concurrency ?? DEFAULT_HYDRATE_CONCURRENCY;
  const concurrency =
    Number.isFinite(requested) && requested >= 1
      ? Math.floor(requested)
      : DEFAULT_HYDRATE_CONCURRENCY;
  const manifest: HydrateManifest = new Map();
  const objects = store.manifest ? await store.manifest(prefix) : undefined;
  const storeObjects =
    objects ??
    (await store.list(prefix)).map((key) => ({ key, generation: undefined }));
  const entries: HydrateEntry[] = [];
  const admitted: string[] = [];
  let generationAware = false;
  for (const object of storeObjects) {
    const { key } = object;
    const rel = prefix ? key.slice(prefix.length + 1) : key;
    if (!rel || excluded(rel, excludes)) continue;
    admitted.push(rel);
    if (object.generation !== undefined) generationAware = true;
    if (opts.filter && !opts.filter(rel)) continue;
    entries.push({ key, rel, generation: object.generation });
  }
  const listed = { rels: admitted, generationAware };
  await opts.onListed?.(listed);
  const priority = opts.priority
    ? entries.filter((entry) => opts.priority?.(entry.rel))
    : [];
  const remaining = opts.priority
    ? entries.filter((entry) => !opts.priority?.(entry.rel))
    : entries;
  const state: HydrateDownloadState = { total: 0, failed: false };
  const download = (batch: HydrateEntry[]) =>
    downloadHydrationEntries({
      store,
      destDir,
      entries: batch,
      manifest,
      maxBytes,
      concurrency,
      state,
      limitError: (observedBytes) =>
        new HydrateLimitError(maxBytes, observedBytes),
    });
  await download(priority);
  return { manifest, listed, done: download(remaining) };
}

/** Download everything under `prefix` into `destDir`. Returns the manifest. */
export async function hydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<HydrateManifest> {
  const started = await startHydrate(store, prefix, destDir, opts);
  await started.done;
  return started.manifest;
}

export type { SyncBackOptions, SyncResult } from "./sync-back";
export { syncBack } from "./sync-back";
