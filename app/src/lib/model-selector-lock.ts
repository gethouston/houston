import type {
  Agent,
  AgentModelChoice,
  Capabilities,
} from "@houston/engine-adapter";
import { canEditAgentConfig } from "./agent-access.ts";
import { isModelAllowed } from "./ceiling-match.ts";
import { type CeilingResolver, pickCeilingPin } from "./ceiling-pin.ts";
import { isMultiplayer } from "./org-roles.ts";

export interface ModelSelectorDecision {
  show: boolean;
  personal: boolean;
}

export function modelSelectorDecision(
  capabilities: Capabilities | null | undefined,
  agent: Pick<Agent, "access"> | null | undefined,
): ModelSelectorDecision {
  if (agent == null) return { show: true, personal: false };
  if (!isMultiplayer(capabilities)) return { show: true, personal: false };
  if (capabilities?.teams === true) return { show: true, personal: true };
  return { show: canEditAgentConfig(capabilities, agent), personal: false };
}

export interface ModelPin {
  provider: string;
  model: string;
  effort?: string;
}

export function resolvePersonalModelPin(
  choice: AgentModelChoice | null | undefined,
  allowedModels: string[] | null | undefined,
  fallback: ModelPin,
  missionPin: ModelPin | null,
  resolver: CeilingResolver,
): ModelPin {
  const allowed = (pin: { provider: string; model: string }) =>
    isModelAllowed(allowedModels, pin.provider, pin.model, resolver.runsAs);
  const personalPin =
    choice && allowed(choice)
      ? {
          provider: choice.provider,
          model: choice.model,
          effort: choice.effort,
        }
      : resolveCeilingDefault(
          allowedModels,
          choice?.effort ? { ...fallback, effort: choice.effort } : fallback,
          resolver,
        );
  if (missionPin && allowed(missionPin)) {
    return {
      provider: missionPin.provider,
      model: missionPin.model,
      effort: personalPin.effort,
    };
  }
  return personalPin;
}

function resolveCeilingDefault(
  allowedModels: string[] | null | undefined,
  fallback: ModelPin,
  resolver: CeilingResolver,
): ModelPin {
  return allowedModels != null &&
    allowedModels.length > 0 &&
    !isModelAllowed(
      allowedModels,
      fallback.provider,
      fallback.model,
      resolver.runsAs,
    )
    ? pickCeilingPin(allowedModels, fallback, resolver)
    : fallback;
}
