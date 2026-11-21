import type { ModuleContext } from "../../module-context";
import { field, requireString } from "../payload";
import type { TeamsModule } from "./index";
import type {
  AgentAssignment,
  AgentModelChoice,
  AgentSettingsUpdate,
} from "./policy-types";
import { TeamsCommand } from "./types";

function requireObject<T>(payload: unknown, key: string): T {
  const value = field(payload, key);
  if (typeof value !== "object" || value === null) {
    throw new Error(`missing '${key}'`);
  }
  return value as T;
}

function requireArray<T>(payload: unknown, key: string): T[] {
  const value = field(payload, key);
  if (!Array.isArray(value)) throw new Error(`missing '${key}'`);
  return value as T[];
}

export function registerTeamsCommands(
  ctx: ModuleContext,
  module: TeamsModule,
): void {
  const agent = (p: unknown) => requireString(p, "agentSlugOrId");

  ctx.registerCommand(TeamsCommand.SetAssignments, (p) =>
    module.setAgentAssignments(
      agent(p),
      requireArray<AgentAssignment>(p, "assignments"),
    ),
  );
  ctx.registerCommand(TeamsCommand.GetSettings, (p) =>
    module.getAgentSettings(agent(p)),
  );
  ctx.registerCommand(TeamsCommand.SetSettings, (p) =>
    module.setAgentSettings(
      agent(p),
      requireObject<AgentSettingsUpdate>(p, "settings"),
    ),
  );
  ctx.registerCommand(TeamsCommand.GetModelChoice, (p) =>
    module.getAgentModelChoice(agent(p)),
  );
  ctx.registerCommand(TeamsCommand.SetModelChoice, (p) =>
    module.setAgentModelChoice(
      agent(p),
      requireObject<AgentModelChoice>(p, "choice"),
    ),
  );
  ctx.registerCommand(TeamsCommand.TriggerStatus, (p) =>
    module.agentTriggerStatus(agent(p)),
  );
}
