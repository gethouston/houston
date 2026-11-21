import { basename, sep } from "node:path";
import { isAtomicTemp } from "@houston/protocol";

export const DEFAULT_EXCLUDES = ["data/auth.json"];

export const STORE_ROOT_PACKAGE_EXCLUDES: readonly string[] = [".pnpm-store/"];

const norm = (rel: string) => rel.split(sep).join("/");

function segmentGlobMatches(pattern: string, path: string): boolean {
  const subtree = pattern.endsWith("/");
  const want = (subtree ? pattern.slice(0, -1) : pattern).split("/");
  const have = path.split("/");
  if (subtree ? have.length < want.length : have.length !== want.length) {
    return false;
  }
  return want.every((seg, i) => seg === "*" || seg === have[i]);
}

const AGENT_ROOT_DEPTH = 3;

function anyDepthDirMatches(pattern: string, path: string): boolean {
  const dir = pattern.slice("**/".length, -1);
  const segments = path.split("/");
  const first = segments[0] === "workspaces" ? AGENT_ROOT_DEPTH : 0;
  return segments.slice(first, -1).includes(dir);
}

export function excluded(rel: string, excludes: string[]): boolean {
  const normalized = norm(rel);
  if (isAtomicTemp(normalized)) return true;
  if (
    normalized.endsWith(".tmp") &&
    excluded(normalized.slice(0, -4), excludes)
  )
    return true;
  if (normalized.endsWith(".houston/runtime/auth.json")) return true;
  if (normalized.split("/").includes("auth-users")) return true;
  return excludes.some((exclude) => {
    const pattern = norm(exclude);
    if (pattern.startsWith("**/") && pattern.endsWith("/")) {
      return anyDepthDirMatches(pattern, normalized);
    }
    if (pattern.includes("*")) {
      return segmentGlobMatches(pattern, normalized);
    }
    if (pattern.endsWith("/")) {
      const subtree = pattern.slice(0, -1);
      return normalized === subtree || normalized.startsWith(pattern);
    }
    if (!pattern.includes("/")) return basename(normalized) === pattern;
    return normalized === pattern;
  });
}
