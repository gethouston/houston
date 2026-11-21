import { posix } from "node:path";
import type { TurnFilesystem } from "./turn-filesystem";

export type OpInclude = (relativePath: string) => boolean;

export function agentRouteScope(workspaceRel: string): OpInclude {
  const root = `${workspaceRel}/`;
  const runtime = `${posix.join(workspaceRel, ".houston", "runtime")}/`;
  return (rel) => rel.startsWith(root) && !rel.startsWith(runtime);
}

export function importScope(workspaceRel: string, dataRel: string): OpInclude {
  const agent = agentRouteScope(workspaceRel);
  const conversations = `${posix.join(dataRel, "conversations")}/`;
  const sessions = `${posix.join(dataRel, "sessions")}/`;
  return (rel) => {
    if (agent(rel) || rel.startsWith(sessions)) return true;
    if (!rel.startsWith(conversations)) return false;
    const [name = "", segment, ...deeper] = rel
      .slice(conversations.length)
      .split("/");
    if (segment === undefined) return name.endsWith(".json");
    return (
      deeper.length === 0 &&
      name.endsWith(".archive") &&
      segment.endsWith(".json")
    );
  };
}

export function conversationScope(dataRel: string, cid: string): OpInclude {
  const file = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(cid)}.json`,
  );
  const sessions = `${posix.join(dataRel, "sessions", cid)}/`;
  const archives = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(cid)}.archive/`,
  );
  return (rel) =>
    rel === file || rel.startsWith(archives) || rel.startsWith(sessions);
}

export function engineAgentId(
  filesystem: Pick<TurnFilesystem, "workspaceRel">,
): string {
  return filesystem.workspaceRel.replace(/^workspaces\//, "");
}
