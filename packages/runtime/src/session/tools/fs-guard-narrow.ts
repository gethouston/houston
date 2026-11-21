import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isCredential } from "./fs-guard-containment";
import {
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
  ReadOnlyFolderError,
} from "./fs-guard-errors";
import {
  contains,
  type RootBoundary,
  realNearest,
  resolveLikePi,
} from "./fs-guard-paths";

export interface Narrowing {
  files: RootBoundary[];
  readable: string[];
  readableShown: string[];
}

export function narrowingFor(
  workspace: RootBoundary,
  allowedFiles: string[] = [],
  readableDirs: string[] = [],
): Narrowing | null {
  if (!allowedFiles.length) {
    if (readableDirs.length)
      throw new Error("readableDirs only applies alongside allowedFiles");
    return null;
  }
  return {
    files: allowedFiles.map((file) => ({
      canonical: realNearest(resolve(file)),
      lexical: resolve(file),
    })),
    readable: readableDirs.map((dir) => relativeInside(workspace, dir)),
    readableShown: readableDirs.map((dir) => resolve(dir)),
  };
}

function relativeInside(workspace: RootBoundary, dir: string): string {
  const abs = resolve(dir);
  for (const base of [workspace.lexical, workspace.canonical]) {
    const rel = relative(base, abs);
    const escapes = rel === ".." || rel.startsWith(`..${sep}`);
    if (rel && !escapes && !isAbsolute(rel)) return rel;
  }
  throw new Error(`A readable folder must sit below the workspace: ${dir}`);
}

export function assertNarrowed(
  raw: string,
  workspace: RootBoundary,
  narrowing: Narrowing,
): string {
  const root = workspace.canonical;
  const abs = resolveLikePi(raw, root);
  const real = realNearest(abs);
  if (narrowing.readable.some((rel) => contains(real, join(root, rel)))) {
    const lexicalInside =
      contains(abs, workspace.canonical) || contains(abs, workspace.lexical);
    if (
      isCredential(real, workspace) ||
      (lexicalInside && isCredential(abs, workspace))
    )
      throw new PathDeniedError(raw);
    return real;
  }
  return assertAllowedFile(raw, abs, real, root, narrowing);
}

export function assertNotReadOnly(
  proven: string,
  root: string,
  narrowing: Narrowing | null,
): void {
  if (narrowing?.readable.some((rel) => contains(proven, join(root, rel))))
    throw new ReadOnlyFolderError();
}

function assertAllowedFile(
  raw: string,
  abs: string,
  real: string,
  root: string,
  narrowing: Narrowing,
): string {
  const allowed = narrowing.files.some(
    (file) =>
      abs === file.lexical ||
      abs === file.canonical ||
      real === file.canonical ||
      real === file.lexical,
  );
  if (!allowed)
    throw new PathNotAllowedError(
      raw,
      narrowing.files.map((file) => file.lexical),
      narrowing.readableShown,
    );
  const boundary: RootBoundary = { canonical: root, lexical: root };
  if (!contains(real, root)) throw new PathEscapeError(raw, root);
  if (isCredential(real, boundary)) throw new PathDeniedError(raw);
  return real;
}
