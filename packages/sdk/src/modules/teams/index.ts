import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { registerTeamsCommands } from "./commands";
import type {
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  AgentSettingsUpdate,
  TriggerStatusItem,
} from "./policy-types";
import {
  agentTriggerStatus,
  getAgentModelChoice,
  getAgentSettings,
  setAgentAssignments,
  setAgentModelChoice,
  setAgentSettings,
} from "./settings";

export type {
  AgentAccess,
  AgentAssignment,
  AgentEffortLevel,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  AgentSettingsUpdate,
  TriggerPlanSkipCode,
  TriggerPlanSkipped,
  TriggerStatusItem,
  TriggerStatusState,
} from "./policy-types";
export type { TeamsCommandType } from "./types";
export { TeamsCommand } from "./types";

export interface TeamsModule {
  setAgentAssignments(
    agentSlugOrId: string,
    assignments: AgentAssignment[],
  ): Promise<void>;
  getAgentSettings(agentSlugOrId: string): Promise<AgentSettings>;
  setAgentSettings(
    agentSlugOrId: string,
    settings: AgentSettingsUpdate,
  ): Promise<void>;
  getAgentModelChoice(agentSlugOrId: string): Promise<AgentModelChoiceInfo>;
  setAgentModelChoice(
    agentSlugOrId: string,
    choice: AgentModelChoice,
  ): Promise<void>;
  agentTriggerStatus(agentSlugOrId: string): Promise<TriggerStatusItem[]>;
}

export class TeamsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "TeamsHttpError");
  }
}

export function createTeamsModule(ctx: ModuleContext): TeamsModule {
  const scope = moduleScope(ctx, "teams", TeamsHttpError);

  const module: TeamsModule = {
    setAgentAssignments: (agentSlugOrId, assignments) =>
      setAgentAssignments(scope, agentSlugOrId, assignments),
    getAgentSettings: (agentSlugOrId) => getAgentSettings(scope, agentSlugOrId),
    setAgentSettings: (agentSlugOrId, settings) =>
      setAgentSettings(scope, agentSlugOrId, settings),
    getAgentModelChoice: (agentSlugOrId) =>
      getAgentModelChoice(scope, agentSlugOrId),
    setAgentModelChoice: (agentSlugOrId, choice) =>
      setAgentModelChoice(scope, agentSlugOrId, choice),
    agentTriggerStatus: (agentSlugOrId) =>
      agentTriggerStatus(scope, agentSlugOrId),
  };

  registerTeamsCommands(ctx, module);
  return module;
}
