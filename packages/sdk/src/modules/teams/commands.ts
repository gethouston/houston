/**
 * The command vocabulary of the teams module: the untrusted-payload readers and
 * the registration of every {@link TeamsCommand} against the same facade the
 * typed path calls.
 *
 * Kept out of `index.ts` so the module factory there stays a wiring layer, and
 * so the one place that reads a serialized envelope is the one place that
 * validates it.
 */

import type { ModuleContext } from "../../module-context";
import { field, requireString } from "../payload";
import type { TeamsModule } from "./index";
import type {
  AgentAssignment,
  AgentModelChoice,
  AgentSettingsUpdate,
} from "./policy-types";
import { TeamsCommand } from "./types";

/**
 * A required object off an untrusted command payload, as `T`.
 *
 * A dispatched envelope arrives serialized, so the handler validates its
 * payload itself; the gateway validates the shape below the top level. This
 * guards only that something object-shaped arrived — what tells a malformed
 * envelope from an empty patch.
 */
function requireObject<T>(payload: unknown, key: string): T {
  const value = field(payload, key);
  if (typeof value !== "object" || value === null) {
    throw new Error(`missing '${key}'`);
  }
  return value as T;
}

/** A required array off an untrusted command payload, as `T[]`. */
function requireArray<T>(payload: unknown, key: string): T[] {
  const value = field(payload, key);
  if (!Array.isArray(value)) throw new Error(`missing '${key}'`);
  return value as T[];
}

/** Bind every teams command to `module`, the same facade the typed path uses. */
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
