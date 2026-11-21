import type { Routine } from "@houston/engine-adapter";
import { useMemo } from "react";
import { resolveAgentModelOverrides } from "../lib/agent-model-overrides";
import type { CeilingResolver } from "../lib/ceiling-pin";
import { providerForModel, providerOffersModel } from "../lib/model-labels";
import {
  modelSelectorDecision,
  resolvePersonalModelPin,
} from "../lib/model-selector-lock";
import { catalogRunsAs } from "../lib/providers";
import { routinePinnedPair } from "../lib/routine-pinned-pair";
import type { Agent } from "../lib/types";
import { useAgentConfig, useAgentModelChoice } from "./queries";
import { useCapabilities } from "./use-capabilities";

const GATEWAY_CEILING_RESOLVER: CeilingResolver = {
  offers: providerOffersModel,
  providerFor: providerForModel,
  runsAs: catalogRunsAs,
  connected: [],
};

export interface RoutineModelResolution {
  provider: string;
  model: string;
  followsAgent: boolean;
  allowedModels: string[] | null;
}

export function useRoutineModelResolution(
  agent: Agent,
  routine: Pick<Routine, "provider" | "model">,
): RoutineModelResolution {
  const { capabilities } = useCapabilities();
  const { personal } = modelSelectorDecision(capabilities, agent);
  const { data: choiceInfo } = useAgentModelChoice(agent.id, personal);
  const allowedModels = personal ? (choiceInfo?.allowedModels ?? null) : null;
  const { data: config } = useAgentConfig(agent.folderPath);

  const { provider: pinnedProvider, model: pinnedModel } =
    routinePinnedPair(routine);
  const followsAgent = !pinnedProvider;
  const choice = personal ? choiceInfo?.choice : null;

  return useMemo(() => {
    if (!followsAgent) {
      return {
        provider: pinnedProvider,
        model: pinnedModel,
        followsAgent: false,
        allowedModels,
      };
    }
    const agentPin = resolveAgentModelOverrides(config ?? {});
    const fallback = {
      provider: agentPin.providerOverride ?? "",
      model: agentPin.modelOverride ?? "",
    };
    if (!fallback.provider) {
      return { ...fallback, followsAgent: true, allowedModels };
    }
    const pin = resolvePersonalModelPin(
      choice,
      allowedModels,
      fallback,
      null,
      GATEWAY_CEILING_RESOLVER,
    );
    return {
      provider: pin.provider,
      model: pin.model,
      followsAgent: true,
      allowedModels,
    };
  }, [
    followsAgent,
    pinnedProvider,
    pinnedModel,
    allowedModels,
    config,
    choice,
  ]);
}
