import type { AgentInitialConfig } from "@houston/protocol";
import type { AgentAccess, AgentAssignment } from "./types";

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  role?: string;
  timezone?: string;
  createdAt: string;
  lastOpenedAt?: string;
  localDir?: string;
  assigned?: boolean;
  assignedUserIds?: string[];
  access?: AgentAccess;
  assignments?: AgentAssignment[];
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
  config?: AgentInitialConfig;
  migration?: boolean;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}
