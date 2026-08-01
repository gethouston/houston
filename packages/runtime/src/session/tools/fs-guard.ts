import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
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
 * root, and returns the absolute path the tool is then forced to use.
 * Shared roots (the org-shared mirror) get the same discipline — agents edit
 * the org original there by design. Callers rewrite the tool's path param to the clamped result, so a
 * normalization divergence from pi cannot escape an allowed root.
 *
 * Containment alone is NOT enough: the runtime's own dataDir sits INSIDE the
 * workspace root (`<agentDir>/.houston/runtime`, wired in the host's
 * `dataDirFor`), so the credential files — `auth.json`, every team member's
 * `auth-users/<hash>.json`, and a materialized `claude-login/.credentials.json`
 * — resolve to legal in-workspace paths. On a shared team pod that would let one
 * prompt-injected agent read the whole space's live provider tokens with no bash
 * tool at all. Hence the second rule below: a DENY list of credential path
 * segments that every allowed root enforces, for reads and writes alike.
 */

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Path segments that mark runtime credential material, matched anywhere under
 * an allowed root. Matching by SEGMENT (not by full path) is what makes the rule
 * survive a layout change: moving the data dir deeper or shallower cannot open a
 * hole. It deliberately over-denies — a user file that happens to be named
 * `auth.json` is refused too, which is the safe direction for a wall whose
 * failure mode is leaking every team member's access token.
 */
const DENIED_SEGMENTS = new Set(["auth.json", "auth-users", "claude-login"]);

interface RootBoundary {
  canonical: string;
  lexical: string;
}

export interface WorkspaceGuardOptions {
  /** Extra WRITABLE roots outside the workspace — the org-shared mirror.
   *  Shared skills are agent-editable by design (an agent's edit IS an edit
   *  of the org original); deletion stays a human act in the UI, and the
   *  same symlink-resolved containment applies as for the workspace. */
  sharedRoots?: string[];
}

export class PathEscapeError extends Error {
  constructor(raw: string, root: string) {
    super(
      `Path is outside the agent workspace: ${raw} (file tools can only touch files under ${root})`,
    );
    this.name = "PathEscapeError";
  }
}

/**
 * A path inside an allowed root that holds sign-in credentials. The message is
 * shown verbatim in a tool result, so it stays plain-language and never echoes
 * anything but the path the model itself supplied.
 */
export class PathDeniedError extends Error {
  constructor(raw: string) {
    super(
      `This file holds the sign-in credentials for the connected accounts, so it cannot be read or changed: ${raw}. Those accounts are already connected for you, and nothing in that file is needed to do the work.`,
    );
    this.name = "PathDeniedError";
  }
}

/** Mirror pi's `expandPath` (normalizePath with unicode-space, @ and ~ handling). */
function normalizeLikePi(input: string): string {
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
  return p;
}

export class WorkspaceGuard {
  /** Canonical (symlink-resolved) workspace root. Must exist. */
  readonly root: string;
  /** Canonical shared (writable) roots outside the workspace; missing roots are ignored. */
  readonly sharedRoots: string[];
  private readonly workspaceBoundary: RootBoundary;
  private readonly sharedBoundaries: RootBoundary[];

  constructor(root: string, options?: WorkspaceGuardOptions) {
    this.workspaceBoundary = {
      canonical: realpathSync(root),
      lexical: resolve(root),
    };
    this.root = this.workspaceBoundary.canonical;
    const boundaries = (options?.sharedRoots ?? []).flatMap(
      (sharedRoot): RootBoundary[] => {
        try {
          return [
            {
              canonical: realpathSync(sharedRoot),
              lexical: resolve(sharedRoot),
            },
          ];
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      },
    );
    this.sharedBoundaries = boundaries.filter(
      (boundary, index) =>
        boundary.canonical !== this.root &&
        boundaries.findIndex(
          (candidate) => candidate.canonical === boundary.canonical,
        ) === index,
    );
    this.sharedRoots = this.sharedBoundaries.map(
      (boundary) => boundary.canonical,
    );
  }

  /**
   * Resolve a model-supplied path and require it to land inside an allowed
   * root, on something that is not credential material. Returns the absolute
   * path to hand to the tool. Throws PathEscapeError on any escape (absolute
   * path outside every root, `..` traversal, `~`, `@`- or file://-prefixed
   * absolutes, or a symlink whose target leaves the roots) and PathDeniedError
   * on the runtime's credential files.
   */
  clamp(raw: string | undefined): string {
    return this.resolveAndAssert(raw, [
      this.workspaceBoundary,
      ...this.sharedBoundaries,
    ]);
  }

  /** Guard a path pi already resolved (the operations-hook inner wall). */
  assertInside(absolutePath: string): string {
    return this.assertContained(resolve(absolutePath), absolutePath, [
      this.workspaceBoundary,
      ...this.sharedBoundaries,
    ]);
  }

  private resolveAndAssert(
    raw: string | undefined,
    allowedRoots: RootBoundary[],
  ): string {
    const input = raw ?? ".";
    const normalized = normalizeLikePi(input);
    const abs = isAbsolute(normalized)
      ? resolve(normalized)
      : resolve(this.root, normalized);
    return this.assertContained(abs, input, allowedRoots);
  }

  private assertContained(
    abs: string,
    raw: string,
    allowedRoots: RootBoundary[],
  ): string {
    // Lexical containment first, so a path that never belonged here reads as an
    // ESCAPE (a sibling `auth.json` outside every root is not "denied", it is
    // out of bounds). The credential rule then runs on the cheap lexical form,
    // before `realNearest`'s syscalls.
    const inside = allowedRoots.filter(
      (allowedRoot) =>
        this.contains(abs, allowedRoot.lexical) ||
        this.contains(abs, allowedRoot.canonical),
    );
    if (!inside.length) throw new PathEscapeError(raw, this.root);
    if (inside.some((allowedRoot) => this.isCredential(abs, allowedRoot)))
      throw new PathDeniedError(raw);
    const real = this.realNearest(abs);
    for (const allowedRoot of inside) {
      if (this.contains(real, allowedRoot.canonical)) {
        // A symlink inside an allowed root pointing at `auth.json` must not
        // launder it, so the resolved form is judged too.
        if (this.isCredential(real, allowedRoot))
          throw new PathDeniedError(raw);
        return abs;
      }
    }
    throw new PathEscapeError(raw, this.root);
  }

  private contains(abs: string, root: string): boolean {
    return abs === root || abs.startsWith(root + sep);
  }

  /**
   * Whether any segment of `abs` BELOW the allowed root it sits in names
   * credential material. Judged relative to that root so a directory named
   * `claude-login` ABOVE it (it appears as `..` from the root) can never deny
   * the whole tree. Lower-cased because macOS and Windows filesystems are
   * case-insensitive by default, so `AUTH.JSON` would otherwise open the very
   * file `auth.json` denies.
   */
  private isCredential(abs: string, boundary: RootBoundary): boolean {
    const base = this.contains(abs, boundary.canonical)
      ? boundary.canonical
      : boundary.lexical;
    for (const segment of relative(base, abs).split(sep)) {
      if (DENIED_SEGMENTS.has(segment.toLowerCase())) return true;
    }
    return false;
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
