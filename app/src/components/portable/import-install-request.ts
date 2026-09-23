/**
 * What the "From a friend" install DECIDES, kept apart from the engine
 * round-trip that carries it out (`import-install.ts`) so the decisions are
 * testable without a transport.
 */

import type { PortableInstallRequest } from "@houston/engine-adapter";
import type { KickoffPin } from "../../lib/kickoff-pin";

export interface InstallImportedAgentArgs {
  packageId: string;
  workspaceName: string;
  agentName: string;
  agentColor: string;
  include: {
    skillSlugs: string[];
    routineIds: string[];
    learningIds: string[];
  };
}

/**
 * The CLAUDE.md (instructions) always rides along — it is the agent's identity,
 * so there is no toggle for it anywhere in the flow.
 */
export function importInstallRequest({
  packageId,
  workspaceName,
  agentName,
  agentColor,
  include,
}: InstallImportedAgentArgs): PortableInstallRequest {
  return {
    packageId,
    workspaceName,
    agentName,
    agentColor,
    selection: {
      includeClaudeMd: true,
      includeSkillSlugs: include.skillSlugs,
      includeRoutineIds: include.routineIds,
      includeLearningIds: include.learningIds,
    },
  };
}

/**
 * The sticky last-used preference is a PAIR: half of one (a provider with no
 * model) would seed the next creation flow with a provider whose model has to
 * be guessed, so an incomplete pin writes nothing.
 */
export function lastUsedFromPin(
  pin: KickoffPin,
): { provider: string; model: string } | null {
  return pin.provider && pin.model
    ? { provider: pin.provider, model: pin.model }
    : null;
}
