import { posix } from "node:path";

/**
 * The `.houston` directories other writers own: the runtime tree (settings,
 * credentials, transcripts), provider config, the doc families (projected and
 * merged by their own paths), skills, and the legacy layouts (`memory/` holds
 * the pre-migration learnings, `prompts/` and `migration/` are host markers).
 * The store's
 * claimAllowsTurnAgentKey (cloud internal/podstore/claims.go) holds the same
 * list.
 */
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

/**
 * Files an agent-level mutation may own from a claimed turn. Mirrors the
 * store's turn-claim object scope EXACTLY — any path admitted here but
 * rejected server-side would be attempted at sync and 403'd (a silent
 * partial sync), so the two rules must not drift: ordinary workspace files,
 * the two turn-owned doc files, the agent's own `.houston/` state, and
 * the store-root custom-integration definitions.
 *
 * The agent's own state matters because a pooled turn's tree is thrown away:
 * a routine that dedupes through `.houston/state/watermark.json` and has that
 * write dropped re-reads the old watermark next run and repeats every post.
 */
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
