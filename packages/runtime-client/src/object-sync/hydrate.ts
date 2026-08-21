import { stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { fileSha256 } from "./file-hash";
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
  /** Every admitted path BEFORE `filter` (the store's view of the tree). */
  onListed?: (rels: string[]) => void;
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

/** Download everything under `prefix` into `destDir`. Returns the manifest. */
export async function hydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<HydrateManifest> {
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
  const listed =
    objects ??
    (await store.list(prefix)).map((key) => ({ key, generation: undefined }));
  const entries: { generation?: string; key: string; rel: string }[] = [];
  const admitted: string[] = [];
  for (const object of listed) {
    const { key } = object;
    const rel = prefix ? key.slice(prefix.length + 1) : key;
    if (!rel || excluded(rel, excludes)) continue;
    admitted.push(rel);
    if (opts.filter && !opts.filter(rel)) continue;
    entries.push({ key, rel, generation: object.generation });
  }
  opts.onListed?.(admitted);
  // Workers pull from a shared cursor. The first failure (download error or
  // the size cap) parks every worker before it takes new work, and only that
  // first error is thrown — workers themselves never reject, so a second
  // failure can never become an unhandled rejection behind Promise.all.
  let total = 0;
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async () => {
    // The cap check also gates NEW downloads (not only completed ones), so an
    // over-cap workspace overshoots by at most the in-flight batch — the
    // pooled analogue of the sequential loop's one-object overshoot.
    while (!failed && total <= maxBytes) {
      const entry = entries[next++];
      if (!entry) return;
      const { generation, key, rel } = entry;
      try {
        const dest = join(destDir, ...rel.split("/"));
        await store.download(key, dest);
        // Size from stat, hash streamed for large files: wake-hydrating a
        // multi-GiB object must not buffer it in heap just to digest it.
        const { size } = await stat(dest);
        total += size;
        if (total > maxBytes) {
          throw new HydrateLimitError(maxBytes, total);
        }
        manifest.set(rel, { hash: await fileSha256(dest, size), generation });
      } catch (err) {
        if (!failed) {
          failed = true;
          firstError = err;
        }
        return;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, worker),
  );
  if (failed) throw firstError;
  return manifest;
}

export type { SyncBackOptions, SyncResult } from "./sync-back";
export { syncBack } from "./sync-back";
