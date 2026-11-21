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

export function lastUsedFromPin(
  pin: KickoffPin,
): { provider: string; model: string } | null {
  return pin.provider && pin.model
    ? { provider: pin.provider, model: pin.model }
    : null;
}
