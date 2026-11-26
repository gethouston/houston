import { relative, sep } from "node:path";
import { PathDeniedError, PathEscapeError } from "./fs-guard-errors";
import {
  contains,
  foldName,
  type RootBoundary,
  realNearest,
  stripStream,
} from "./fs-guard-paths";

/**
 * The rules a resolved path is judged against: root containment and the
 * credential deny list. (The exact-file allowlist that narrows both to a single
 * document lives in fs-guard-narrow.ts.) Kept apart from the guard object so
 * each rule reads as a pure decision over (path, boundaries) with nothing else
 * in scope.
 */

/**
 * Path segments that mark runtime credential material, matched anywhere under
 * an allowed root. Matching by SEGMENT (not by full path) is what makes the rule
 * survive a layout change: moving the data dir deeper or shallower cannot open a
 * hole. It deliberately over-denies — a user file that happens to be named
 * `auth.json` is refused too, which is the safe direction for a wall whose
 * failure mode is leaking every team member's access token.
 */
export const DENIED_SEGMENTS: ReadonlySet<string> = new Set([
  "auth.json",
  "auth-users",
  "claude-login",
]);

/**
 * Whether any segment of `abs` BELOW the allowed root it sits in names
 * credential material. Judged relative to that root so a directory named
 * `claude-login` ABOVE it (it appears as `..` from the root) can never deny
 * the whole tree. Case-folded (`foldName`) because macOS and Windows
 * filesystems are case-insensitive by default, so `AUTH.JSON` would otherwise
 * open the very file `auth.json` denies. Stream suffixes and trailing dots or
 * spaces go too: Windows opens `auth.json` for `auth.json::$DATA` and
 * `auth.json.` alike.
 */
export function isCredential(abs: string, boundary: RootBoundary): boolean {
  const base = contains(abs, boundary.canonical)
    ? boundary.canonical
    : boundary.lexical;
  for (const segment of relative(base, abs).split(sep)) {
    if (DENIED_SEGMENTS.has(foldName(windowsName(segment)))) return true;
  }
  return false;
}

/**
 * The name Windows opens for a segment: it drops stream suffixes and trailing
 * dots or spaces in either order (`auth-users::$INDEX_ALLOCATION.` is the
 * folder), so both are stripped until neither is left.
 */
function windowsName(segment: string): string {
  for (let name = segment; ;) {
    const next = stripStream(name).replace(/[. ]+$/, "");
    if (next === name) return name;
    name = next;
  }
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
