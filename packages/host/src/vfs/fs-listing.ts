import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { isAtomicTemp } from "./fs-scratch";
import type { ObjectStat } from "./vfs";

/**
 * The directory walk behind `FsVfs.list` / `listDetailed` — a live workspace's
 * listing, which always races the writer it is listing.
 */

/**
 * An entry that disappeared (or whose parent turned into a file) between the
 * readdir that named it and the syscall that reads it. The workspace is live —
 * the agent writes files during a turn, pi creates and removes its
 * `auth.json.lock` dir around every credential refresh, and `writeBytes` renames
 * a temp over its target — so a walk ALWAYS races. A vanished entry is simply
 * not in the listing; anything else (EACCES, EIO) still throws, per the
 * no-silent-failures policy. Without this, one unlucky rename 500'd the whole
 * request: HOU-1176 (`GET /files` → "ENOENT … stat '…/activity.json.<n>.<x>.tmp'"),
 * plus the same crash in `list_skills`, `delete_file` and `save_attachments`.
 */
export function isVanished(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

interface Walked {
  path: string;
  size: number;
  mtimeMs: number;
  birthMs: number;
}

async function walk(dir: string, out: Walked[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isVanished(err)) return; // directory removed mid-walk
    throw err;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) {
      // Our own in-flight atomic writes are not workspace content: they are
      // about to be renamed away, and surfacing them would leak scratch rows
      // into the Files tab and orphan tmp objects into the store sync.
      if (isAtomicTemp(e.name)) continue;
      try {
        const s = await stat(p);
        out.push({
          path: p,
          size: s.size,
          mtimeMs: s.mtimeMs,
          birthMs: s.birthtimeMs,
        });
      } catch (err) {
        if (isVanished(err)) continue; // file removed/renamed mid-walk
        throw err;
      }
    }
  }
}

/** Every file under `dir`, keyed relative to `root`, sorted by key. */
export async function statsUnder(
  root: string,
  dir: string,
): Promise<ObjectStat[]> {
  // A missing prefix, or one that resolves to a plain file, has no keys UNDER
  // it — the same answer an object store gives. Walking it would readdir() a
  // file and throw.
  try {
    if (!(await stat(dir)).isDirectory()) return [];
  } catch (err) {
    if (isVanished(err)) return [];
    throw err;
  }
  const found: Walked[] = [];
  await walk(dir, found);
  return found
    .map((f) => ({
      key: f.path
        .slice(root.length + 1)
        .split(sep)
        .join("/"),
      size: f.size,
      // TRUNCATED, never rounded: the filesystem reports fractional
      // milliseconds, and rounding one up names an instant that has not
      // happened - a file that reports itself created after the moment it
      // was read.
      updatedMs: Math.floor(f.mtimeMs),
      // Linux filesystems without birthtime report 0 — omit rather than lie.
      ...(f.birthMs > 0 ? { createdMs: Math.floor(f.birthMs) } : {}),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
