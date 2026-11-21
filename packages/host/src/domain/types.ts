export type WorkspaceId = string;
export type UserId = string;
export type AgentId = string;

export type WorkspaceKind = "personal" | "org";

export type WorkspaceRuntime = "gke" | "cloudrun" | "local";

export interface Workspace {
  id: WorkspaceId;
  ownerUserId: UserId;
  kind: WorkspaceKind;
  name: string;
  slug: string;
  runtime: WorkspaceRuntime;
  createdAt: number;
}

export interface Agent {
  id: AgentId;
  workspaceId: WorkspaceId;
  name: string;
  createdAt: number;
}
