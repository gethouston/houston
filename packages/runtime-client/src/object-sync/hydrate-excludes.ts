import { basename, sep } from "node:path";

export const DEFAULT_EXCLUDES = ["data/auth.json"];

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

export function excluded(rel: string, excludes: string[]): boolean {
  const normalized = norm(rel);
  if (normalized.endsWith(".tmp")) return true;
  if (normalized.endsWith(".houston/runtime/auth.json")) return true;
  // Credential paths differ by deployment depth, so segment matching must
  // exclude auth-users unconditionally instead of relying on caller patterns.
  if (normalized.split("/").includes("auth-users")) return true;
  return excludes.some((exclude) => {
    const pattern = norm(exclude);
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
