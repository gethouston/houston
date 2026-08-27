import { posix } from "node:path";

/** Files an agent-level mutation may own without entering turn runtime state. */
export function agentScopeIncludes(
  relativePath: string,
  workspaceRel: string,
): boolean {
  if (relativePath === "custom-integrations.json") return true;
  const root = `${workspaceRel}/`;
  const runtime = `${posix.join(workspaceRel, ".houston", "runtime")}/`;
  return relativePath.startsWith(root) && !relativePath.startsWith(runtime);
}
