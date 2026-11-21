import { ASSISTANT_AGENT_NAME } from "../routes/assistant";

export {
  ASSISTANT_ROLE_ENV,
  ASSISTANT_USER_ID_ENV,
  type AssistantRuntimeRole,
  assistantRoleEnv,
  COORDINATOR_ROLE,
  readAssistantRole,
} from "@houston/domain/assistant-role";

import {
  ASSISTANT_USER_ID_ENV,
  type AssistantRuntimeRole,
  COORDINATOR_ROLE,
} from "@houston/domain/assistant-role";
import { coordinatorScope } from "../assistant/coordinator-scope";

export const MANAGED_CLOUD_ENV = "HOUSTON_MANAGED_CLOUD";

export interface AssistantRoleInput {
  agentId: string;
  hostEnv?: NodeJS.ProcessEnv;
}

function agentName(agentId: string): string {
  const cut = agentId.lastIndexOf("/");
  return cut === -1 ? agentId : agentId.slice(cut + 1);
}

export function assistantRuntimeRole(
  input: AssistantRoleInput,
): AssistantRuntimeRole | null {
  if (coordinatorScope()) return COORDINATOR_ROLE;
  const hostEnv = input.hostEnv ?? process.env;
  if (
    hostEnv[MANAGED_CLOUD_ENV] === "1" &&
    hostEnv[ASSISTANT_USER_ID_ENV]?.trim()
  )
    return COORDINATOR_ROLE;
  return agentName(input.agentId) === ASSISTANT_AGENT_NAME
    ? COORDINATOR_ROLE
    : null;
}
