import { createHash } from "node:crypto";
import { posix } from "node:path";

export const LINK_HEADER = "X-Houston-Object-Link";
export const EXECUTABLE_HEADER = "X-Houston-Object-Executable";

const MAX_LINK_TARGET_BYTES = 4096;
const EXECUTE_BITS = 0o111;
const SYSTEM_INTERPRETER = /^\/usr(\/local)?\/bin\/python(3(\.\d{1,2})?)?$/;

export function linkTargetProblem(rel: string, target: string): string | null {
  if (
    target === "" ||
    Buffer.byteLength(target) > MAX_LINK_TARGET_BYTES ||
    target.includes("\0") ||
    target.includes("\\")
  )
    return "has an unusable target";
  const steps = target.split("/");
  const climb = steps.findIndex((step) => step !== "..");
  if (climb !== -1 && steps.slice(climb).includes(".."))
    return "has an unusable target";
  const segments = rel.split("/");
  if (segments.length < 4 || segments[0] !== "workspaces")
    return "is outside an agent folder";
  const root = segments.slice(0, 3).join("/");
  if (target.startsWith("/")) {
    if (!SYSTEM_INTERPRETER.test(target))
      return "points outside the agent folder";
    return rel.startsWith(`${root}/.houston/`)
      ? "is in Houston's own folder"
      : null;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(rel), target));
  if (!resolved.startsWith(`${root}/`))
    return "points outside the agent folder";
  const state = `${root}/.houston`;
  const inState = (path: string) =>
    path === state || path.startsWith(`${state}/`);
  if (inState(rel) || inState(resolved)) return "is in Houston's own folder";
  return null;
}

export function linkHash(target: string): string {
  return `link:${createHash("sha256").update(target).digest("hex")}`;
}

export function contentHash(sha256: string, executable: boolean): string {
  return executable ? `${sha256}:x` : sha256;
}

export function isExecutable(mode: number): boolean {
  return (mode & EXECUTE_BITS) !== 0;
}

export function withExecute(mode: number): number {
  return mode | ((mode & 0o444) >> 2);
}
