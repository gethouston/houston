import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import type { ObjectStore } from "./object-store";

/**
 * Workspace hydration for the per-turn runtime: an agent's durable state is a
 * GCS prefix; a turn materializes it into a throwaway local dir, runs, then
 * syncs the delta back and wipes the dir. The manifest (content hashes taken
 * at hydration) is what makes sync-back a real diff: unchanged files are not
 * re-uploaded, locally-deleted files are deleted remotely.
 *
 * auth.json is ALWAYS excluded both ways: the per-turn access token is
 * injected per request and must never persist into object storage.
 */

export type HydrateManifest = Map<string, string>; // rel path -> sha256

export const DEFAULT_EXCLUDES = ["data/auth.json"];

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

const norm = (rel: string) => rel.split(sep).join("/");

function excluded(rel: string, excludes: string[]): boolean {
  return excludes.includes(rel) || rel.endsWith(".tmp");
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
    const rel = key.slice(prefix.length + 1);
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
    if (entry.isSymbolicLink()) continue; // never follow or persist symlinks
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else out.push(norm(relative(base, abs)));
  }
  return out;
}

export interface SyncResult {
  uploaded: string[];
  deleted: string[];
}

/**
 * Upload new/changed files under `dir` to `prefix`, delete remote keys whose
 * local files vanished. Errors propagate — a failed sync is data loss the
 * caller MUST surface, never swallow.
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
  const seen = new Set<string>();
  for (const rel of await walkFiles(dir, dir)) {
    if (excluded(rel, excludes)) continue;
    seen.add(rel);
    const abs = join(dir, ...rel.split("/"));
    const s = await stat(abs);
    if (!s.isFile()) continue;
    const hash = sha256(await readFile(abs));
    if (manifest.get(rel) !== hash) {
      await store.upload(abs, posix.join(prefix, rel));
      uploaded.push(rel);
    }
  }
  const deleted: string[] = [];
  for (const rel of manifest.keys()) {
    if (!seen.has(rel)) {
      await store.delete(posix.join(prefix, rel));
      deleted.push(rel);
    }
  }
  return { uploaded, deleted };
}
