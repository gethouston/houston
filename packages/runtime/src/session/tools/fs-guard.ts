import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertContained } from "./fs-guard-containment";
import {
  BoardWriteDeniedError,
  RoutineWriteDeniedError,
  SharedSkillReadOnlyError,
} from "./fs-guard-errors";
import {
  assertNarrowed,
  assertNotReadOnly,
  type Narrowing,
  narrowingFor,
} from "./fs-guard-narrow";
import {
  contains,
  existingBoundaries,
  foldName,
  type RootBoundary,
  resolveLikePi,
} from "./fs-guard-paths";

export {
  BoardWriteDeniedError,
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
  ProtectedWriteDeniedError,
  ReadOnlyFolderError,
  RoutineWriteDeniedError,
  SharedSkillReadOnlyError,
} from "./fs-guard-errors";

const PROTECTED_WRITES = [
  { family: "activity", refusal: BoardWriteDeniedError },
  { family: "routines", refusal: RoutineWriteDeniedError },
] as const;

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
 * documents its tools may touch, plus `readableDirs` it may only read (the
 * attachments people send it), with every other path refused
 * (fs-guard-narrow.ts). Narrowing to what a role actually needs is what keeps a
 * prompt injection there from rewriting a shared skill every agent runs, or the
 * runtime's own session records.
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
  /** Extra READABLE roots no tool may write: a pooled turn's snapshot of its
   *  org's shared skills (turn/turn-shared-skills.ts). */
  readOnlyRoots?: string[];
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
  /**
   * Folders INSIDE the workspace an `allowedFiles` runtime may read, never
   * write: where the attachments people send it arrive. A folder need not exist
   * yet (it appears with the first upload); a path in it is judged by its real
   * location. Only meaningful alongside `allowedFiles`.
   */
  readableDirs?: string[];
}

export class WorkspaceGuard {
  /** Canonical (symlink-resolved) workspace root. Must exist. */
  readonly root: string;
  /** Canonical shared (writable) roots outside the workspace; missing roots are ignored. */
  readonly sharedRoots: string[];
  private readonly workspaceBoundary: RootBoundary;
  private readonly sharedBoundaries: RootBoundary[];
  private readonly readOnlyBoundaries: RootBoundary[];
  /** Exact files + read-only folders (null = root containment governs). */
  private readonly narrowing: Narrowing | null;

  constructor(root: string, options?: WorkspaceGuardOptions) {
    this.workspaceBoundary = {
      canonical: realpathSync(root),
      lexical: resolve(root),
    };
    this.root = this.workspaceBoundary.canonical;
    const boundaries = existingBoundaries(options?.sharedRoots);
    this.readOnlyBoundaries = existingBoundaries(options?.readOnlyRoots);
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
    this.narrowing = narrowingFor(
      this.workspaceBoundary,
      options?.allowedFiles,
      options?.readableDirs,
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
    const input = raw ?? ".";
    return this.judge(input, resolveLikePi(input, this.root));
  }

  /** Protected domain stores are changed through their tools. */
  clampWrite(raw: string | undefined): string {
    const proven = this.clamp(raw);
    this.assertProtectedWritable(proven);
    return proven;
  }

  /** Guard a path pi already resolved (the operations-hook inner wall). */
  assertInside(absolutePath: string): string {
    return this.judge(absolutePath, resolve(absolutePath));
  }

  assertWritable(absolutePath: string): string {
    const proven = this.assertInside(absolutePath);
    this.assertProtectedWritable(proven);
    return proven;
  }

  private assertProtectedWritable(proven: string): void {
    for (const { family, refusal } of PROTECTED_WRITES) {
      const store = foldName(join(this.root, ".houston", family));
      const target = foldName(proven);
      // The flat pre-v0.4 file too: the boot layout migration moves it into
      // the store when the store holds no document yet.
      if (contains(target, store) || target === `${store}.json`)
        throw new refusal();
    }
    for (const { canonical, lexical } of this.readOnlyBoundaries) {
      if (contains(proven, canonical) || contains(proven, lexical))
        throw new SharedSkillReadOnlyError();
    }
    assertNotReadOnly(proven, this.root, this.narrowing);
  }

  /** `raw` is the model's string (echoed in refusals), `abs` its resolution. */
  private judge(raw: string, abs: string): string {
    if (this.narrowing)
      return assertNarrowed(raw, this.workspaceBoundary, this.narrowing);
    return assertContained(
      abs,
      raw,
      [
        this.workspaceBoundary,
        ...this.sharedBoundaries,
        ...this.readOnlyBoundaries,
      ],
      this.root,
    );
  }
}
