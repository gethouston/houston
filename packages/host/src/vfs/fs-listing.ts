import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { isAtomicTemp } from "./fs-scratch";
import type { ObjectStat } from "./vfs";

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
    if (isVanished(err)) return;
    throw err;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) {
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
        if (isVanished(err)) continue;
        throw err;
      }
    }
  }
}

export async function statsUnder(
  root: string,
  dir: string,
): Promise<ObjectStat[]> {
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
      updatedMs: Math.floor(f.mtimeMs),
      ...(f.birthMs > 0 ? { createdMs: Math.floor(f.birthMs) } : {}),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
