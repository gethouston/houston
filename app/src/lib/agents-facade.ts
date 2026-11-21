import type {
  AgentAssignment,
  AgentInitialConfig,
  FirstDayStartInput,
  FirstDayStartResult,
} from "@houston/engine-adapter";
import {
  isAgentNameReserved,
  isAgentNameTaken,
  isFirstDayNotPending,
} from "@houston/sdk";
import { blockWriteWhileWarmingById } from "./agent-warming-guard";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";
import type { Agent } from "./types";

export interface CreateAgentResult {
  agent: Agent;
}

export function toAgent(a: import("@houston/engine-adapter").Agent): Agent {
  return {
    id: a.id,
    name: a.name,
    folderPath: a.folderPath,
    localDir: a.localDir,
    configId: a.configId,
    color: a.color,
    createdAt: a.createdAt,
    lastOpenedAt: a.lastOpenedAt,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
  };
}

export const tauriAgents = {
  list: (workspaceId: string) =>
    engineCall<Agent[]>("list_agents", async () =>
      (await getEngine().listAgents(workspaceId)).map(toAgent),
    ),
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
  ) =>
    engineCall<CreateAgentResult>(
      "create_agent",
      async () => {
        const r = await getEngine().createAgent(workspaceId, {
          name,
          configId,
          color,
          claudeMd,
          installedPath,
          seeds,
          existingPath,
          config,
        });
        return {
          agent: toAgent(r.agent),
        };
      },
      undefined,
      { silence: isAgentNameTaken },
    ),
  delete: (workspaceId: string, id: string) =>
    engineCall<void>("delete_agent", () =>
      getEngine().deleteAgent(workspaceId, id),
    ),
  startFirstDay: (agentPath: string, input: FirstDayStartInput) =>
    engineCall<FirstDayStartResult>(
      "start_first_day",
      () => getEngine().startFirstDay(agentPath, input),
      { agentId: agentPath },
      { silence: isFirstDayNotPending },
    ),
  rename: (workspaceId: string, id: string, newName: string) => {
    blockWriteWhileWarmingById(id);
    return engineCall<Agent>(
      "rename_agent",
      async () =>
        toAgent(await getEngine().renameAgent(workspaceId, id, newName)),
      undefined,
      {
        silence: (err: unknown) =>
          isAgentNameTaken(err) || isAgentNameReserved(err),
      },
    );
  },
  updateColor: (workspaceId: string, id: string, color: string) =>
    engineCall<Agent>("update_agent_color", async () =>
      toAgent(await getEngine().updateAgent(workspaceId, id, { color })),
    ),
  listInstalledConfigs: () =>
    engineCall<Array<{ config: unknown; path: string }>>(
      "list_installed_configs",
      () => getEngine().listInstalledConfigs(),
    ),
  setAssignments: (agentSlugOrId: string, assignments: AgentAssignment[]) =>
    engineCall<void>("set_agent_assignments", () =>
      getEngine().setAgentAssignments(agentSlugOrId, assignments),
    ),
};
