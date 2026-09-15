import { basename, sep } from "node:path";
import { isAtomicTemp } from "@houston/protocol";

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

/**
 * `**\/name/` excludes every file under a directory called `name` at ANY
 * depth: the shape a rebuildable toolchain takes (node_modules, .venv) when an
 * agent installs it somewhere inside its workspace. Only directories match;
 * a file that happens to be called `name` is not a toolchain.
 */
function anyDepthDirMatches(pattern: string, path: string): boolean {
  const dir = pattern.slice("**/".length, -1);
  return path.split("/").slice(0, -1).includes(dir);
}

export function excluded(rel: string, excludes: string[]): boolean {
  const normalized = norm(rel);
  // Unconditional, whatever a caller configures: a half-written file must
  // never be published as content. Every atomic write in Houston — host,
  // runtime and this package — names its temp target with ATOMIC_TMP_SUFFIX
  // precisely so this one line can find it, and finds NOTHING else: excluding
  // plain `.tmp` also swallowed the user's own `notes.tmp`, listed in the
  // Files tab and silently dropped at pod teardown.
  if (isAtomicTemp(normalized)) return true;
  // A `.tmp` beside an excluded file is that file's half-written twin from
  // before every atomic write carried ATOMIC_TMP_SUFFIX; a crash could have
  // left `auth.json.tmp` on a pod, and it stays as private as `auth.json`.
  if (
    normalized.endsWith(".tmp") &&
    excluded(normalized.slice(0, -4), excludes)
  )
    return true;
  if (normalized.endsWith(".houston/runtime/auth.json")) return true;
  // Credential paths differ by deployment depth, so segment matching must
  // exclude auth-users unconditionally instead of relying on caller patterns.
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
