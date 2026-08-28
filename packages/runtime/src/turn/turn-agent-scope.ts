import { posix } from "node:path";

/**
 * Files an agent-level mutation may own from a claimed turn. Mirrors the
 * store's turn-claim object scope EXACTLY — any path admitted here but
 * rejected server-side would be attempted at sync and 403'd (a silent
 * partial sync), so the two rules must not drift: ordinary workspace files,
 * the two turn-owned doc files, and the store-root custom-integration
 * definitions. Every other `.houston` family (docs, runtime, settings)
 * belongs to other writers.
 */
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
  return (
    rest === "routines/routines.json" || rest === "learnings/learnings.json"
  );
}
