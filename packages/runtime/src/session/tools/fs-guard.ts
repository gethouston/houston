import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Workspace path guard — the wall that keeps the agent's file tools inside its
 * workspace (cloud security Gate #1).
 *
 * pi's built-in file tools resolve model-supplied paths with `resolveToCwd`,
 * which honors absolute paths, `~`, a leading `@`, and file:// URLs — so a
 * prompt-injected agent could read /etc/passwd or its own auth.json with no
 * bash tool at all. `clamp` re-resolves the raw path the way pi does, requires
 * the result (and its symlink-resolved real path) to land inside the workspace
 * root, and returns the absolute path the tool is then forced to use. Callers
 * REWRITE the tool's path param to the clamped result, so a normalization
 * divergence from pi can only mis-resolve INSIDE the workspace, never escape.
 */

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

export class PathEscapeError extends Error {
  constructor(raw: string, root: string) {
    super(
      `Path is outside the agent workspace: ${raw} (file tools can only touch files under ${root})`,
    );
    this.name = "PathEscapeError";
  }
}

/** Mirror pi's `expandPath` (normalizePath with unicode-space, @ and ~ handling). */
function normalizeLikePi(input: string): string {
  let p = input.replace(UNICODE_SPACES, " ");
  if (p.startsWith("@")) p = p.slice(1);
  if (p === "~") return homedir();
  if (p.startsWith("~/") || (process.platform === "win32" && p.startsWith("~\\"))) {
    return join(homedir(), p.slice(2));
  }
  if (/^file:\/\//.test(p)) return fileURLToPath(p);
  return p;
}

export class WorkspaceGuard {
  /** Canonical (symlink-resolved) workspace root. Must exist. */
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(root);
  }

  /**
   * Resolve a model-supplied path and require it to land inside the workspace.
   * Returns the absolute path to hand to the tool. Throws PathEscapeError on
   * any escape: absolute path outside the root, `..` traversal, `~`, `@`- or
   * file://-prefixed absolutes, or a symlink whose target leaves the root.
   */
  clamp(raw: string | undefined): string {
    const input = raw ?? ".";
    const normalized = normalizeLikePi(input);
    const abs = isAbsolute(normalized) ? resolve(normalized) : resolve(this.root, normalized);
    if (!this.contains(abs) || !this.contains(this.realNearest(abs))) {
      throw new PathEscapeError(input, this.root);
    }
    return abs;
  }

  /** Guard a path pi already resolved (the operations-hook inner wall). */
  assertInside(absolutePath: string): string {
    const abs = resolve(absolutePath);
    if (!this.contains(abs) || !this.contains(this.realNearest(abs))) {
      throw new PathEscapeError(absolutePath, this.root);
    }
    return abs;
  }

  private contains(abs: string): boolean {
    return abs === this.root || abs.startsWith(this.root + sep);
  }

  /**
   * Real (symlink-resolved) form of `abs`: realpath of its deepest existing
   * ancestor joined back with the not-yet-existing tail. Catches both a
   * symlinked file and a symlinked parent directory pointing outside the
   * workspace, while still allowing paths that don't exist yet (write/mkdir).
   */
  private realNearest(abs: string): string {
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
}
