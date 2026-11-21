import { relative, sep } from "node:path";
import { PathDeniedError, PathEscapeError } from "./fs-guard-errors";
import {
  contains,
  foldName,
  type RootBoundary,
  realNearest,
  stripStream,
} from "./fs-guard-paths";

export const DENIED_SEGMENTS: ReadonlySet<string> = new Set([
  "auth.json",
  "auth-users",
  "claude-login",
]);

export function isCredential(abs: string, boundary: RootBoundary): boolean {
  const base = contains(abs, boundary.canonical)
    ? boundary.canonical
    : boundary.lexical;
  for (const segment of relative(base, abs).split(sep)) {
    if (DENIED_SEGMENTS.has(foldName(windowsName(segment)))) return true;
  }
  return false;
}

function windowsName(segment: string): string {
  for (let name = segment; ; ) {
    const next = stripStream(name).replace(/[. ]+$/, "");
    if (next === name) return name;
    name = next;
  }
}

export function assertContained(
  abs: string,
  raw: string,
  allowedRoots: RootBoundary[],
  root: string,
): string {
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
      if (isCredential(real, allowedRoot)) throw new PathDeniedError(raw);
      return real;
    }
  }
  throw new PathEscapeError(raw, root);
}
