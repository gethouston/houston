import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Path arithmetic shared by the workspace guard: resolving a model-supplied
 * path exactly the way pi does, and asking where the result really lands once
 * symlinks are followed. Nothing here decides anything — the rules live in
 * fs-guard-containment.ts — so a normalization change is reviewable on its own.
 */

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * NTFS alternate-data-stream suffixes (`auth.json::$DATA`, `auth.json:hidden`).
 * On Windows they address the SAME file under a different name, so a rule that
 * matches path segments would see `auth.json::$DATA` and not `auth.json` while
 * the open call reads the credential all the same. Stripped on every platform:
 * the suffix is meaningless elsewhere, and a rule that only holds on one OS is
 * a rule that will be found not holding on another.
 */
const NTFS_STREAM = /:[^:\\/]*(?::\$[A-Za-z_]+)?$/;

/** An allowed root in both the forms containment is judged against. */
export interface RootBoundary {
  canonical: string;
  lexical: string;
}

/** Mirror pi's `expandPath` (normalizePath with unicode-space, @ and ~ handling). */
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
  return stripStream(p);
}

/**
 * `path::$DATA` / `path:stream` -> `path`, leaving a Windows drive letter
 * (`C:\dir`) and a bare drive-relative path alone.
 */
function stripStream(input: string): string {
  const start = input.length > 1 && input[1] === ":" ? 2 : 0;
  const head = input.slice(0, start);
  const tail = input.slice(start);
  return tail.includes(":") ? head + tail.replace(NTFS_STREAM, "") : input;
}

/**
 * The absolute path pi would use for a model-supplied string: normalized its
 * way, then resolved against the workspace root when relative.
 */
export function resolveLikePi(raw: string, root: string): string {
  const normalized = normalizeLikePi(raw);
  return isAbsolute(normalized)
    ? resolve(normalized)
    : resolve(root, normalized);
}

export function contains(abs: string, root: string): boolean {
  return abs === root || abs.startsWith(root + sep);
}

/**
 * Real (symlink-resolved) form of `abs`: realpath of its deepest existing
 * ancestor joined back with the not-yet-existing tail. Catches both a
 * symlinked file and a symlinked parent directory pointing outside the
 * workspace, while still allowing paths that don't exist yet (write/mkdir).
 */
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
