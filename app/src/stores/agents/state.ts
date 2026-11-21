import type { AgentInitialConfig } from "@houston/engine-adapter";
import type { AgentPaint } from "../../lib/agent-roster-overlay";
import type { Agent } from "../../lib/types";

export interface CreatedAgent {
  agent: Agent;
}

export interface AgentState {
  agents: Agent[];
  current: Agent | null;
  loading: boolean;
  loaded: boolean;
  loadedWorkspaceId: string | null;
  loadAgents: (
    workspaceId: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  settleEmpty: () => void;
  setCurrent: (agent: Agent) => void;
  adopt: (agent: Agent) => void;
  create: (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
    config?: AgentInitialConfig,
  ) => Promise<CreatedAgent>;
  delete: (workspaceId: string, id: string) => Promise<void>;
  rename: (workspaceId: string, id: string, newName: string) => Promise<Agent>;
  updateColor: (
    workspaceId: string,
    id: string,
    color: string,
  ) => Promise<void>;
  paint: (id: string, paint: AgentPaint) => (revert?: boolean) => void;
  reset: () => void;
}
