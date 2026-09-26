/**
 * The teams module (Teams v2) — the per-agent policy a manager sets on one
 * shared agent: assignments, toolkit and model ceilings, the acting user's
 * model pick, and whether an agent's routine triggers are live.
 *
 * These are pure commands over hosted-gateway routes: every read is a settings
 * panel opening and every write is a form's one-shot, so there is no reactive
 * scope to publish and nothing here subscribes to an event. The same handlers
 * back both the typed facade and the `dispatch` path (`./commands`).
 *
 * SEAM — space-scoped, never a sandbox call. The per-agent routes are gateway
 * control routes ABOUT an agent rather than calls into it, so they run on the
 * module's own {@link moduleScope} rooted at the base URL and never
 * `clientFor(agentId)`. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier.
 *
 * Nothing degrades here: every non-2xx throws a `TeamsHttpError` carrying its
 * `status`, and the surface decides what a 404 means for it.
 */

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
