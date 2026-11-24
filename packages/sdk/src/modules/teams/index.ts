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

/** The typed facade for the teams family. Every call throws on a non-2xx. */
export interface TeamsModule {
  /**
   * Replace who may drive an agent, and at what access level. Every row states
   * its own access: there is no id-only shorthand, because a shorthand can only
   * guess one level and would silently demote every manager it is handed.
   */
  setAgentAssignments(
    agentSlugOrId: string,
    assignments: AgentAssignment[],
  ): Promise<void>;
  /** The manager-set toolkit and model ceilings on one agent. */
  getAgentSettings(agentSlugOrId: string): Promise<AgentSettings>;
  /** Write those ceilings; the gateway merges, so send only what changed. */
  setAgentSettings(
    agentSlugOrId: string,
    settings: AgentSettingsUpdate,
  ): Promise<void>;
  /** The caller's own model pick for an agent, plus the allowed ceiling. */
  getAgentModelChoice(agentSlugOrId: string): Promise<AgentModelChoiceInfo>;
  /** Set the caller's model pick; the gateway clamps it to the ceiling. */
  setAgentModelChoice(
    agentSlugOrId: string,
    choice: AgentModelChoice,
  ): Promise<void>;
  /** One agent's per-routine trigger status (C9). */
  agentTriggerStatus(agentSlugOrId: string): Promise<TriggerStatusItem[]>;
}

/** A failed teams request. `status` is the upstream HTTP status. */
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
