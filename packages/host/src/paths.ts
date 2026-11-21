import type { Agent, Workspace } from "./domain/types";

export interface WorkspacePaths {
  agentPrefix(ws: Workspace, agent: Agent): string;
  agentRoot(ws: Workspace, agent: Agent): string;
  dataRoot(ws: Workspace, agent: Agent): string;
  sharedRoot(ws: Pick<Workspace, "id">): string;
}

export function conversationKey(
  paths: WorkspacePaths,
  ws: Workspace,
  agent: Agent,
  cid: string,
): string {
  return `${paths.dataRoot(ws, agent)}/conversations/${encodeURIComponent(cid)}.json`;
}

export function settingsKey(
  paths: WorkspacePaths,
  ws: Workspace,
  agent: Agent,
): string {
  return `${paths.dataRoot(ws, agent)}/settings.json`;
}

export class CloudPaths implements WorkspacePaths {
  agentPrefix(ws: Workspace, agent: Agent): string {
    return `ws/${ws.id}/${agent.id}`;
  }
  agentRoot(ws: Workspace, agent: Agent): string {
    return `${this.agentPrefix(ws, agent)}/workspace`;
  }
  dataRoot(ws: Workspace, agent: Agent): string {
    return `${this.agentPrefix(ws, agent)}/data`;
  }
  sharedRoot(ws: Pick<Workspace, "id">): string {
    return `ws/${ws.id}/shared`;
  }
}

export class LocalPaths implements WorkspacePaths {
  agentPrefix(_ws: Workspace, agent: Agent): string {
    return agent.id;
  }
  agentRoot(_ws: Workspace, agent: Agent): string {
    return agent.id;
  }
  dataRoot(_ws: Workspace, agent: Agent): string {
    return `${agent.id}/.houston/runtime`;
  }
  sharedRoot(ws: Pick<Workspace, "id">): string {
    return `${ws.id}/.shared`;
  }
}

const CLOUD = new CloudPaths();

export const workspaceRoot = (ws: Workspace, agent: Agent) =>
  CLOUD.agentRoot(ws, agent);
