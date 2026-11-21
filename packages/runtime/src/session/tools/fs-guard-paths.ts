import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

const NTFS_STREAM = /:[^:\\/]*(?::\$[A-Za-z_]+)?$/;

export interface RootBoundary {
  canonical: string;
  lexical: string;
}

export function normalizeLikePi(input: string): string {
  let p = input.replace(UNICODE_SPACES, " ");
  if (p.startsWith("@")) p = p.slice(1);
  if (p === "~") return homedir();
  if (
    p.startsWith("~/") ||
    (process.platform === "win32" && p.startsWith("~\\"))
  ) {
    return join(homedir(), p.slice(2));
  }
  if (/^file:\/\//.test(p)) return fileURLToPath(p);
  return process.platform === "win32" ? stripStream(p) : p;
}

export function stripStream(input: string): string {
  const start = input.length > 1 && input[1] === ":" ? 2 : 0;
  const head = input.slice(0, start);
  const tail = input.slice(start);
  return tail.includes(":") ? head + tail.replace(NTFS_STREAM, "") : input;
}

export function resolveLikePi(raw: string, root: string): string {
  const normalized = normalizeLikePi(raw);
  return isAbsolute(normalized)
    ? resolve(normalized)
    : resolve(root, normalized);
}

export function foldName(name: string): string {
  return name.normalize("NFKC").toLowerCase();
}

export function contains(abs: string, root: string): boolean {
  return abs === root || abs.startsWith(root + sep);
}

export function realNearest(abs: string): string {
  const tail: string[] = [];
  let current = abs;
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length ? join(real, ...tail.reverse()) : real;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = dirname(current);
      if (parent === current) return current;
      tail.push(basename(current));
      current = parent;
    }
  }
}

export function existingBoundaries(roots: string[] = []): RootBoundary[] {
  return roots.flatMap((root): RootBoundary[] => {
    try {
      return [{ canonical: realpathSync(root), lexical: resolve(root) }];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  });
}
