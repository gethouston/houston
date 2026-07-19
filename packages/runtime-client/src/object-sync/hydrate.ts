import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, posix, relative, sep } from "node:path";
import type { ObjectStore } from "./object-store";

/**
 * Durable engine state is materialized into a local cache, then synchronized
 * back by content hash. The hydration manifest is the ownership boundary: only
 * objects observed on hydrate may be interpreted as locally deleted later.
 * Authentication material and temporary files never cross this boundary.
 */

export type HydrateManifest = Map<string, string>; // rel path -> sha256

export const DEFAULT_EXCLUDES = ["data/auth.json"];

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

const norm = (rel: string) => rel.split(sep).join("/");

export function excluded(rel: string, excludes: string[]): boolean {
  const normalized = norm(rel);
  if (normalized.endsWith(".tmp")) return true;
  if (normalized.endsWith(".houston/runtime/auth.json")) return true;
  return excludes.some((exclude) => {
    const pattern = norm(exclude);
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
  const entries: { key: string; rel: string }[] = [];
  for (const key of await store.list(prefix)) {
    const rel = prefix ? key.slice(prefix.length + 1) : key;
    if (!rel || excluded(rel, excludes)) continue;
    entries.push({ key, rel });
  }
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
      const { key, rel } = entry;
      try {
        const dest = join(destDir, ...rel.split("/"));
        await store.download(key, dest);
        const buf = await readFile(dest);
        total += buf.byteLength;
        if (total > maxBytes) {
          throw new Error(
            `workspace exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB hydration limit`,
          );
        }
        manifest.set(rel, sha256(buf));
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

async function walkFiles(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else out.push(norm(relative(base, abs)));
  }
  return out;
}

export interface SyncResult {
  uploaded: string[];
  deleted: string[];
  manifest: HydrateManifest;
  /**
   * Total bytes of every synced (non-excluded) file — the size the NEXT
   * hydration must swallow. Callers compare it against their hydrate cap and
   * warn while the agent is writing, not when a later wake fails.
   */
  totalBytes: number;
}

/**
 * Upload new or changed files and remove previously observed objects whose
 * local files vanished. Errors propagate because a failed sync is data loss
 * that the owning lifecycle must surface or retry.
 */
export async function syncBack(
  store: ObjectStore,
  prefix: string,
  dir: string,
  manifest: HydrateManifest,
  opts: { excludes?: string[] } = {},
): Promise<SyncResult> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const uploaded: string[] = [];
  const nextManifest: HydrateManifest = new Map();
  let totalBytes = 0;
  for (const rel of await walkFiles(dir, dir)) {
    if (excluded(rel, excludes)) continue;
    const abs = join(dir, ...rel.split("/"));
    // The agent keeps writing during a sync pass, so a walked file may vanish
    // before it is read (runtime session files are rewritten constantly). A
    // vanished file is indistinguishable from one deleted before the walk:
    // leave it out of the next manifest and let the delete pass reconcile the
    // store, instead of aborting the whole pass mid-upload.
    let buf: Buffer;
    let size: number;
    try {
      const fileStat = await stat(abs);
      if (!fileStat.isFile()) continue;
      size = fileStat.size;
      buf = await readFile(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    totalBytes += size;
    const hash = sha256(buf);
    nextManifest.set(rel, hash);
    if (manifest.get(rel) !== hash) {
      await store.upload(abs, prefix ? posix.join(prefix, rel) : rel);
      uploaded.push(rel);
    }
  }
  const deleted: string[] = [];
  for (const rel of manifest.keys()) {
    if (!nextManifest.has(rel)) {
      await store.delete(prefix ? posix.join(prefix, rel) : rel);
      deleted.push(rel);
    }
  }
  return { uploaded, deleted, manifest: nextManifest, totalBytes };
}
