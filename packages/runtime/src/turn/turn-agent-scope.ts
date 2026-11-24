import { posix } from "node:path";

export const HOUSTON_OWNED_DIRS: ReadonlySet<string> = new Set([
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

export const HOUSTON_OWNED_FILES: ReadonlySet<string> = new Set([
  "activity.json",
  "agent.json",
  "config.json",
  "integrations.json",
  "learnings.json",
  "routine_runs.json",
  "routines.json",
  "skills-manifest.json",
]);

export function agentScopeIncludes(
  relativePath: string,
  workspaceRel: string,
): boolean {
  if (relativePath === "custom-integrations.json") return true;
  const root = `${workspaceRel}/`;
  if (!relativePath.startsWith(root)) return false;
  const internal = `${posix.join(workspaceRel, ".houston")}/`;
  if (`${relativePath}/` === internal) return false;
  if (!relativePath.startsWith(internal)) return true;
  const rest = relativePath.slice(internal.length);
  if (rest === "routines/routines.json" || rest === "learnings/learnings.json")
    return true;
  const segments = rest.split("/");
  if (!segments.every((s) => s !== "" && s !== "." && s !== "..")) return false;
  const [first = ""] = segments;
  if (HOUSTON_OWNED_DIRS.has(first)) return false;
  return segments.length > 1 || !HOUSTON_OWNED_FILES.has(first);
}
