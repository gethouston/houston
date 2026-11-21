import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function agentDirFor(workspacesRoot: string, id: string): string {
  return join(workspacesRoot, ...id.split("/"));
}

function isSyntheticAgentId(id: string): boolean {
  return id
    .split("/")
    .some(
      (segment) =>
        segment.startsWith(".") && segment !== "." && segment !== "..",
    );
}

export function liveAgentDirFor(workspacesRoot: string, id: string): string {
  const dir = agentDirFor(workspacesRoot, id);
  if (!existsSync(dir)) {
    if (isSyntheticAgentId(id)) {
      mkdirSync(dir, { recursive: true });
      return dir;
    }
    throw new Error(
      `agent directory for '${id}' is gone (renamed or deleted?)`,
    );
  }
  return dir;
}
