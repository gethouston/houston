import type { AgentColorId } from "@houston/domain";
import type { AgentInitialConfig } from "@houston/protocol";
import type { WireAgent } from "@houston/wire-types";

export type AgentAccess = "manager" | "user";

export interface AgentAssignment {
  userId: string;
  access: AgentAccess;
}

export type { WireAgent } from "@houston/wire-types";

export interface InstalledConfig {
  config: unknown;
  path: string;
}

export interface AgentListItem {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: number;
  role?: string;
  timezone?: string;
}

export interface AgentCreateInput {
  name: string;
  color?: AgentColorId;
  claudeMd?: string;
  seeds?: Record<string, string>;
  config?: AgentInitialConfig;
  migration?: boolean;
}

export interface AgentsWrites {
  create(input: AgentCreateInput): Promise<WireAgent>;
  rename(id: string, name: string): Promise<WireAgent>;
  delete(id: string): Promise<void>;
}

export interface AgentsViewModel {
  loaded: boolean;
  items: AgentListItem[];
}

export const AGENTS_SCOPE = "agents";

export const AgentsCommand = {
  Refresh: "agents/refresh",
  Create: "agents/create",
  Rename: "agents/rename",
  Delete: "agents/delete",
  SetColor: "agents/setColor",
  InstallFromGithub: "agents/installFromGithub",
  StartFirstDay: "agents/startFirstDay",
} as const;
export type AgentsCommandType =
  (typeof AgentsCommand)[keyof typeof AgentsCommand];

export const AGENTS_CHANGED_EVENT = "AgentsChanged";

export const AGENT_ROLE_CHANGED_EVENT = "AgentRoleChanged";
