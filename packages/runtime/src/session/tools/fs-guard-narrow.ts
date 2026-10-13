import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isCredential } from "./fs-guard-containment";
import {
  AttachmentReadOnlyError,
  MemoryWriteDeniedError,
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
} from "./fs-guard-errors";
import {
  contains,
  type RootBoundary,
  realNearest,
  resolveLikePi,
} from "./fs-guard-paths";

/**
 * The NARROWED wall: a runtime whose file surface is a handful of named
 * documents (the coordinator's memory) plus folders it may only read (the
 * attachments people send it). Everything else — the rest of its own workspace,
 * every shared root, everywhere outside — is refused. Being named is necessary,
 * never sufficient: every admitted path must still land inside the workspace
 * and must still not be credential material.
 */
export interface Narrowing {
  /** The exact documents the tools may read AND write. */
  files: RootBoundary[];
  /** Exact documents the tools may only READ (the coordinator's memory). */
  readOnlyFiles: RootBoundary[];
  /**
   * Readable folders as paths RELATIVE to the workspace root. Kept relative and
   * joined onto the canonical root at check time: an upload folder is created
   * on the first upload, long after the guard was built, so resolving it once
   * at construction would lose it for good.
   */
  readable: string[];
  /** The same folders as the policy named them, for the refusal message. */
  readableShown: string[];
}

export function narrowingFor(
  workspace: RootBoundary,
  allowedFiles: string[] = [],
  readableDirs: string[] = [],
  readableFiles: string[] = [],
): Narrowing | null {
  if (!allowedFiles.length && !readableFiles.length) {
    // A wall that is not narrowed already lets every workspace path be read,
    // so a readable folder there is a policy that does not mean what it says.
    if (readableDirs.length)
      throw new Error("readableDirs only applies alongside allowedFiles");
    return null;
  }
  return {
    files: allowedFiles.map(fileBoundary),
    readOnlyFiles: readableFiles.map(fileBoundary),
    readable: readableDirs.map((dir) => relativeInside(workspace, dir)),
    readableShown: readableDirs.map((dir) => resolve(dir)),
  };
}

const fileBoundary = (file: string): RootBoundary => ({
  canonical: realNearest(resolve(file)),
  lexical: resolve(file),
});

/** `dir` as a path below the workspace root; anything else is a policy bug. */
function relativeInside(workspace: RootBoundary, dir: string): string {
  const abs = resolve(dir);
  for (const base of [workspace.lexical, workspace.canonical]) {
    const rel = relative(base, abs);
    const escapes = rel === ".." || rel.startsWith(`..${sep}`);
    if (rel && !escapes && !isAbsolute(rel)) return rel;
  }
  throw new Error(`A readable folder must sit below the workspace: ${dir}`);
}

/**
 * Judge a model-supplied path against the narrowing: a file in a readable
 * folder, else one of the exact documents, else refused. Returns the PROVEN
 * (symlink-resolved) path, so the tool opens what was judged rather than
 * resolving the name a second time.
 */
export function assertNarrowed(
  raw: string,
  workspace: RootBoundary,
  narrowing: Narrowing,
): string {
  const root = workspace.canonical;
  const abs = resolveLikePi(raw, root);
  const real = realNearest(abs);
  // Judged by the REAL path against the folder's place under the CANONICAL
  // root. A realpath never runs through a symlink, so when the folder itself
  // (or anything inside it) is a link pointing elsewhere, no real path carries
  // its prefix and the read falls through to the refusal below. `..` is gone
  // already: resolveLikePi normalized it away before this comparison.
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

/** Every write into a readable folder or read-only document is refused. */
export function assertNotReadOnly(
  proven: string,
  root: string,
  narrowing: Narrowing | null,
): void {
  if (narrowing?.readable.some((rel) => contains(proven, join(root, rel))))
    throw new AttachmentReadOnlyError();
  // Re-resolved now, not only at construction: a link or folder created since
  // must not let a write land on the read-only document under another name.
  if (
    narrowing?.readOnlyFiles.some(
      (file) => isFile(proven, file) || proven === realNearest(file.lexical),
    )
  )
    throw new MemoryWriteDeniedError();
}

const isFile = (path: string, file: RootBoundary): boolean =>
  path === file.lexical || path === file.canonical;

/**
 * The exact-file rule: require the path to BE one of the allowed documents —
 * lexically, or once symlinks are resolved, so neither a link nor a `..` detour
 * can stand in for one. The resolved path must then still land inside the
 * agent's own directory and must still not be credential material, so a listed
 * document that is (or sits behind) a symlink pointing out of the workspace is
 * refused, and `auth.json` cannot be reached by listing it.
 */
function assertAllowedFile(
  raw: string,
  abs: string,
  real: string,
  root: string,
  narrowing: Narrowing,
): string {
  const listed = [...narrowing.files, ...narrowing.readOnlyFiles];
  const allowed = listed.some(
    (file) => isFile(abs, file) || isFile(real, file),
  );
  if (!allowed)
    throw new PathNotAllowedError(
      raw,
      listed.map((file) => file.lexical),
      narrowing.readableShown,
    );
  // `root` is the guard's CANONICAL workspace root, so the real path is the one
  // form that can be compared against it: a lexical match would accept the
  // symlink itself and let the tool follow it anywhere.
  const boundary: RootBoundary = { canonical: root, lexical: root };
  if (!contains(real, root)) throw new PathEscapeError(raw, root);
  if (isCredential(real, boundary)) throw new PathDeniedError(raw);
  return real;
}
