import { useAgentStore } from "../stores/agents";
import {
  type AgentRoleContext,
  buildAgentRoleJobDescription,
} from "./agent-role-context";
import type { KickoffPin } from "./kickoff-pin";

export { nextFreeAgentColor } from "./next-agent-color";

export interface CreatedEmployee {
  id: string;
  name: string;
  color?: string;
  folderPath: string;
}

export interface CreateEmployeeInput {
  workspaceId: string;
  name: string;
  color: string | undefined;
  brief: AgentRoleContext;
  pin: KickoffPin;
  template?: { installedPath?: string; seeds?: Record<string, string> };
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<CreatedEmployee> {
  const { agent } = await useAgentStore
    .getState()
    .create(
      input.workspaceId,
      input.name.trim(),
      "blank",
      input.color,
      buildAgentRoleJobDescription(input.brief),
      input.template?.installedPath,
      input.template?.seeds,
      undefined,
      { ...input.pin, firstDay: "pending", arrival: "created" },
    );
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    folderPath: agent.folderPath,
  };
}
