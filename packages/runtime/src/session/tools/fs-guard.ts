import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assertContained } from "./fs-guard-containment";
import {
  assertNarrowed,
  type Narrowing,
  narrowingFor,
} from "./fs-guard-narrow";
import {
  existingBoundaries,
  type RootBoundary,
  resolveLikePi,
} from "./fs-guard-paths";
import {
  assertKept,
  assertProtected,
  type KeepsWrite,
} from "./fs-guard-protected";

export {
  AgentSettingsWriteDeniedError,
  BoardWriteDeniedError,
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
  ProtectedWriteDeniedError,
  ReadOnlyFolderError,
  RoutineWriteDeniedError,
  SharedSkillReadOnlyError,
  UnsavedWriteError,
} from "./fs-guard-errors";

export interface WorkspaceGuardOptions {
  sharedRoots?: string[];
  readOnlyRoots?: string[];
  allowedFiles?: string[];
  readableDirs?: string[];
  keepsWrite?: KeepsWrite;
}

export class WorkspaceGuard {
  readonly root: string;
  readonly sharedRoots: string[];
  private readonly workspaceBoundary: RootBoundary;
  private readonly sharedBoundaries: RootBoundary[];
  private readonly readOnlyBoundaries: RootBoundary[];
  private readonly narrowing: Narrowing | null;
  private readonly keepsWrite: KeepsWrite | undefined;

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
    this.keepsWrite = options?.keepsWrite;
  }

  clamp(raw: string | undefined): string {
    const input = raw ?? ".";
    return this.judge(input, resolveLikePi(input, this.root));
  }

  clampWrite(raw: string | undefined): string {
    const proven = this.clamp(raw);
    this.assertProtectedWritable(proven);
    assertKept(proven, this.root, this.keepsWrite);
    return proven;
  }

  assertInside(absolutePath: string): string {
    return this.judge(absolutePath, resolve(absolutePath));
  }

  assertWritable(absolutePath: string): string {
    const proven = this.assertWritableDir(absolutePath);
    assertKept(proven, this.root, this.keepsWrite);
    return proven;
  }

  assertWritableDir(absolutePath: string): string {
    const proven = this.assertInside(absolutePath);
    this.assertProtectedWritable(proven);
    return proven;
  }

  private assertProtectedWritable(proven: string): void {
    assertProtected(proven, {
      root: this.root,
      readOnly: this.readOnlyBoundaries,
      narrowing: this.narrowing,
    });
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
