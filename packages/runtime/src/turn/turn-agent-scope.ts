import { posix } from "node:path";

const HOUSTON_OWNED_DIRS: ReadonlySet<string> = new Set([
  "activity",
  "config",
  "docs",
  "learnings",
  "memory",
  "migration",
  "prompts",
  "routine_runs",
  "routines",
  "runtime",
  "sessions",
  "skills",
  "skills-manifest",
]);

export function agentScopeIncludes(
  relativePath: string,
  workspaceRel: string,
): boolean {
  if (relativePath === "custom-integrations.json") return true;
  const root = `${workspaceRel}/`;
  if (!relativePath.startsWith(root)) return false;
  const internal = `${posix.join(workspaceRel, ".houston")}/`;
  if (!relativePath.startsWith(internal)) return true;
  const rest = relativePath.slice(internal.length);
  if (rest === "routines/routines.json" || rest === "learnings/learnings.json")
    return true;
  const segments = rest.split("/");
  if (segments.length < 2 || HOUSTON_OWNED_DIRS.has(segments[0] ?? "")) {
    return false;
  }
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}
