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

export interface WorkspaceGuardOptions {
  sharedRoots?: string[];
  readOnlyRoots?: string[];
  allowedFiles?: string[];
  readableDirs?: string[];
}

export class WorkspaceGuard {
  readonly root: string;
  readonly sharedRoots: string[];
  private readonly workspaceBoundary: RootBoundary;
  private readonly sharedBoundaries: RootBoundary[];
  private readonly readOnlyBoundaries: RootBoundary[];
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

  clamp(raw: string | undefined): string {
    const input = raw ?? ".";
    return this.judge(input, resolveLikePi(input, this.root));
  }

  clampWrite(raw: string | undefined): string {
    const proven = this.clamp(raw);
    this.assertProtectedWritable(proven);
    return proven;
  }

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
      if (contains(target, store) || target === `${store}.json`)
        throw new refusal();
    }
    for (const { canonical, lexical } of this.readOnlyBoundaries) {
      if (contains(proven, canonical) || contains(proven, lexical))
        throw new SharedSkillReadOnlyError();
    }
    assertNotReadOnly(proven, this.root, this.narrowing);
  }

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
