import { relative, sep } from "node:path";
import {
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
 * The rules a resolved path is judged against: root containment, the credential
 * deny list, and the exact-file allowlist that narrows the first two to a
 * single document. Kept apart from the guard object so each rule reads as a
 * pure decision over (path, boundaries) with nothing else in scope.
 */

/**
 * Path segments that mark runtime credential material, matched anywhere under
 * an allowed root. Matching by SEGMENT (not by full path) is what makes the rule
 * survive a layout change: moving the data dir deeper or shallower cannot open a
 * hole. It deliberately over-denies — a user file that happens to be named
 * `auth.json` is refused too, which is the safe direction for a wall whose
 * failure mode is leaking every team member's access token.
 */
const DENIED_SEGMENTS = new Set(["auth.json", "auth-users", "claude-login"]);

/**
 * Whether any segment of `abs` BELOW the allowed root it sits in names
 * credential material. Judged relative to that root so a directory named
 * `claude-login` ABOVE it (it appears as `..` from the root) can never deny
 * the whole tree. Lower-cased because macOS and Windows filesystems are
 * case-insensitive by default, so `AUTH.JSON` would otherwise open the very
 * file `auth.json` denies.
 */
function isCredential(abs: string, boundary: RootBoundary): boolean {
  const base = contains(abs, boundary.canonical)
    ? boundary.canonical
    : boundary.lexical;
  for (const segment of relative(base, abs).split(sep)) {
    if (DENIED_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  return false;
}

/**
 * Require an already-resolved absolute path to land inside one of
 * `allowedRoots` on something that is not credential material. `raw` is the
 * model's own string, echoed in the error; `root` names the workspace in the
 * escape message.
 */
export function assertContained(
  abs: string,
  raw: string,
  allowedRoots: RootBoundary[],
  root: string,
): string {
  // Lexical containment first, so a path that never belonged here reads as an
  // ESCAPE (a sibling `auth.json` outside every root is not "denied", it is
  // out of bounds). The credential rule then runs on the cheap lexical form,
  // before `realNearest`'s syscalls.
  const inside = allowedRoots.filter(
    (allowedRoot) =>
      contains(abs, allowedRoot.lexical) ||
      contains(abs, allowedRoot.canonical),
  );
  if (!inside.length) throw new PathEscapeError(raw, root);
  if (inside.some((allowedRoot) => isCredential(abs, allowedRoot)))
    throw new PathDeniedError(raw);
  const real = realNearest(abs);
  for (const allowedRoot of inside) {
    if (contains(real, allowedRoot.canonical)) {
      // A symlink inside an allowed root pointing at `auth.json` must not
      // launder it, so the resolved form is judged too.
      if (isCredential(real, allowedRoot)) throw new PathDeniedError(raw);
      // The PROVEN path, not the one that was asked for. `abs` is a name that
      // resolved here once; handing it back leaves the tool to resolve it a
      // second time, and between the two resolutions a link can be repointed
      // outside the workspace. What was checked is what gets opened.
      return real;
    }
  }
  throw new PathEscapeError(raw, root);
}

/**
 * The exact-file rule: resolve the model's path the way pi does, then require
 * it to BE one of the allowed documents — lexically, or once symlinks are
 * resolved, so neither a link nor a `..` detour can stand in for one.
 *
 * The allowlist NARROWS the workspace wall, it does not replace it. Being on
 * the list is necessary, never sufficient: the resolved path must still land
 * inside the agent's own directory and must still not be credential material,
 * so a listed document that is (or sits behind) a symlink pointing out of the
 * workspace is refused, and `auth.json` cannot be reached by listing it. The
 * two rules stack in exactly the order containment applies them.
 */
export function assertAllowedFile(
  raw: string,
  root: string,
  allowedFiles: RootBoundary[],
): string {
  const abs = resolveLikePi(raw, root);
  const real = realNearest(abs);
  const allowed = allowedFiles.some(
    (file) =>
      abs === file.lexical ||
      abs === file.canonical ||
      real === file.canonical ||
      real === file.lexical,
  );
  if (!allowed)
    throw new PathNotAllowedError(
      raw,
      allowedFiles.map((file) => file.lexical),
    );
  // `root` is the guard's CANONICAL workspace root, so the real path is the one
  // form that can be compared against it: a lexical match would accept the
  // symlink itself and let the tool follow it anywhere.
  const boundary: RootBoundary = { canonical: root, lexical: root };
  if (!contains(real, root)) throw new PathEscapeError(raw, root);
  if (isCredential(real, boundary)) throw new PathDeniedError(raw);
  // The proven path, for the same reason containment returns one: the tool must
  // open what was judged, not re-resolve the name a second time.
  return real;
}
