/**
 * The provider + model a routine will actually RUN ON (PRODUCT-1475).
 *
 * A routine is either PINNED (it carries its own provider/model, which the fire
 * path honors verbatim) or it follows the agent — and "follows the agent" was
 * all the editor ever said, which told the user nothing about which AI account
 * was about to be billed or whether it even worked. So this resolves the pair
 * either way, reusing the two derivations that already own the answer rather
 * than inventing a third:
 *
 *  - `resolveAgentModelOverrides` — the agent's configured brain, the SAME
 *    resolution every routine/skill kickoff pins its turn with; and
 *  - `resolvePersonalModelPin` — the acting user's per-agent choice in
 *    multiplayer Teams, mirroring the gateway's per-turn resolution.
 *
 * NEVER auth-switch here. `resolveAgentModelOverrides` can substitute a
 * connected provider when handed a confirmed connection set; it is deliberately
 * handed none, because the health badge beside this pair exists to SHOW that
 * the resolved provider is unusable. Substituting a working one would hide the
 * exact state this feature was built to surface.
 */

import type { Routine } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { resolveAgentModelOverrides } from "../lib/agent-model-overrides";
import type { CeilingResolver } from "../lib/ceiling-pin";
import { providerForModel, providerOffersModel } from "../lib/model-labels";
import {
  modelSelectorDecision,
  resolvePersonalModelPin,
} from "../lib/model-selector-lock";
import type { Agent } from "../lib/types";
import { useAgentConfig, useAgentModelChoice } from "./queries";
import { useCapabilities } from "./use-capabilities";

/**
 * How a ceiling pick resolves for an UNATTENDED run: the catalog only, no
 * connection set — exactly the gateway's per-turn clamp, which has no
 * connection knowledge either. Handing it the connected providers would be the
 * auth-switch the comment above forbids (and would show a pair the fire path
 * never runs).
 */
const GATEWAY_CEILING_RESOLVER: CeilingResolver = {
  offers: providerOffersModel,
  providerFor: providerForModel,
  connected: [],
};

export interface RoutineModelResolution {
  /** Resolved provider id; `""` while the agent config has not answered yet. */
  provider: string;
  /** Resolved model id; `""` alongside an unresolved provider. */
  model: string;
  /** The routine carries no pin — it runs on whatever the agent runs on. */
  followsAgent: boolean;
  /**
   * The agent's effective allowed-models ceiling (Teams E8), or `null` for no
   * ceiling. Returned here so the picker fetches it once, not twice.
   */
  allowedModels: string[] | null;
}

export function useRoutineModelResolution(
  agent: Agent,
  routine: Pick<Routine, "provider" | "model">,
): RoutineModelResolution {
  // Teams E8: the pickable set is clamped to the agent's allowed-models
  // ceiling, and in multiplayer the agent's "current model" is the ACTING
  // user's personal per-agent choice, not the shared config.
  const { capabilities } = useCapabilities();
  const { personal } = modelSelectorDecision(capabilities, agent);
  const { data: choiceInfo } = useAgentModelChoice(agent.id, personal);
  const allowedModels = personal ? (choiceInfo?.allowedModels ?? null) : null;
  const { data: config } = useAgentConfig(agent.folderPath);

  const pinnedProvider = routine.provider ?? "";
  const pinnedModel = routine.model ?? "";
  const followsAgent = !pinnedProvider || !pinnedModel;
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
    // No configured provider (or the config has not landed): there is no pair
    // to name yet. `""` is the honest answer — the label falls back to the
    // picker's own "Select model" and the badge stays away rather than probing
    // a provider we invented.
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
