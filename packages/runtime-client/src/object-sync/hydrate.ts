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
}

/** Download everything under `prefix` into `destDir`. Returns the manifest. */
export async function hydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<HydrateManifest> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
  const manifest: HydrateManifest = new Map();
  let total = 0;
  for (const key of await store.list(prefix)) {
    const rel = prefix ? key.slice(prefix.length + 1) : key;
    if (!rel || excluded(rel, excludes)) continue;
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
  }
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
    const fileStat = await stat(abs);
    if (!fileStat.isFile()) continue;
    totalBytes += fileStat.size;
    const hash = sha256(await readFile(abs));
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
