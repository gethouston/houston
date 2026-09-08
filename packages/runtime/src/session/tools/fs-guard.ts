import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assertAllowedFile, assertContained } from "./fs-guard-containment";
import {
  type RootBoundary,
  realNearest,
  resolveLikePi,
} from "./fs-guard-paths";

export {
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
} from "./fs-guard-errors";

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
 * Containment is not the only shape a wall takes. A runtime whose whole job is
 * ONE document — the coordinator, which keeps no work of its own and only ever
 * consolidates its memory — gets `allowedFiles` instead: an exact list of the
 * documents its tools may touch, with every other path in the workspace, in the
 * shared mirror, and everywhere else refused. Narrowing to what a role actually
 * needs is what keeps a prompt injection there from rewriting a shared skill
 * every agent runs, or the runtime's own session records.
 *
 * Containment alone is NOT enough: the runtime's own dataDir sits INSIDE the
 * workspace root (`<agentDir>/.houston/runtime`, wired in the host's
 * `dataDirFor`), so the credential files — `auth.json`, every team member's
 * `auth-users/<hash>.json`, and a materialized `claude-login/.credentials.json`
 * — resolve to legal in-workspace paths. On a shared team pod that would let one
 * prompt-injected agent read the whole space's live provider tokens with no bash
 * tool at all. Hence the second rule, in fs-guard-containment.ts: a DENY list of
 * credential path segments that every allowed root enforces, for reads and
 * writes alike.
 */

export interface WorkspaceGuardOptions {
  /** Extra WRITABLE roots outside the workspace — the org-shared mirror.
   *  Shared skills are agent-editable by design (an agent's edit IS an edit
   *  of the org original); deletion stays a human act in the UI, and the
   *  same symlink-resolved containment applies as for the workspace. */
  sharedRoots?: string[];
  /**
   * An EXACT list of the files the tools may touch. When present it NARROWS the
   * workspace to those files — `sharedRoots` and the rest of the workspace are
   * refused — so a role with a single document to maintain can be given exactly
   * that document. Listing a path is necessary, never sufficient: it must still
   * resolve inside the workspace root and must still not be credential material.
   * A listed file need not exist yet (the memory doc is written before it is
   * first read), and a symlink standing in for one — or a listed path that IS
   * one — is judged by where it really points.
   */
  allowedFiles?: string[];
}

export class WorkspaceGuard {
  /** Canonical (symlink-resolved) workspace root. Must exist. */
  readonly root: string;
  /** Canonical shared (writable) roots outside the workspace; missing roots are ignored. */
  readonly sharedRoots: string[];
  private readonly workspaceBoundary: RootBoundary;
  private readonly sharedBoundaries: RootBoundary[];
  /** Exact-file allowlist (empty = root containment governs). */
  private readonly allowedFiles: RootBoundary[];

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
    this.allowedFiles = (options?.allowedFiles ?? []).map((file) => ({
      canonical: realNearest(resolve(file)),
      lexical: resolve(file),
    }));
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
    if (this.allowedFiles.length)
      return assertAllowedFile(raw ?? ".", this.root, this.allowedFiles);
    const input = raw ?? ".";
    return assertContained(
      resolveLikePi(input, this.root),
      input,
      this.allowedRoots(),
      this.root,
    );
  }

  /** Guard a path pi already resolved (the operations-hook inner wall). */
  assertInside(absolutePath: string): string {
    if (this.allowedFiles.length)
      return assertAllowedFile(absolutePath, this.root, this.allowedFiles);
    return assertContained(
      resolve(absolutePath),
      absolutePath,
      this.allowedRoots(),
      this.root,
    );
  }

  private allowedRoots(): RootBoundary[] {
    return [this.workspaceBoundary, ...this.sharedBoundaries];
  }
}
