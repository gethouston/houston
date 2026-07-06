/**
 * Pure decision helpers for the chat model + effort pickers
 * (ChatModelSelector / ChatEffortSelector).
 *
 * Split out from the components (like the sibling `model-picker.ts` helpers) so
 * the Teams behavior is unit-testable without a React renderer and the
 * containers stay under the file-size budget.
 *
 * Teams E8 (contract Change 3) reversed E7's "hidden for members" rule. In a
 * multiplayer Teams org the composer's model + effort pickers are shown for
 * EVERYONE (plain members included), their option list is clamped to the agent's
 * allowed-models ceiling, and they read+write the ACTING user's PERSONAL
 * per-agent choice rather than the shared agent config. Single-player /
 * self-host is unchanged: shared config, no ceiling, every model. The gateway is
 * the sole enforcer of the ceiling (it clamps every turn to the acting user's
 * choice); these helpers only shape the affordance.
 */

import type {
  Agent,
  AgentModelChoice,
  Capabilities,
} from "@houston-ai/engine-client";
import { canEditAgentConfig, isMultiplayer } from "./org-roles.ts";

export interface ModelSelectorDecision {
  /** Whether the model/effort picker renders at all. */
  show: boolean;
  /**
   * Whether the picker reads+writes the ACTING user's PERSONAL per-agent model
   * choice (multiplayer Teams) instead of the shared agent config
   * (single-player/self-host). Also gates the allowed-models clamp.
   */
  personal: boolean;
}

/**
 * How the composer's model/effort picker should behave for the current caller.
 *
 * - No `agent` scope (`null`/`undefined`) → shown, shared behavior. Non-agent
 *   surfaces (a routine editor with no agent, the create wizard) keep their
 *   prior free behavior.
 * - Single-player / self-host (no org) → shown, shared config, no ceiling.
 * - Multiplayer Teams (the `teams` capability) → shown for EVERYONE (members
 *   included), wired to the caller's personal per-agent choice.
 * - Multiplayer host predating Teams (no per-user route) → falls back to the E7
 *   gate: only an agent-manager may edit the shared config; hidden for members.
 */
export function modelSelectorDecision(
  capabilities: Capabilities | null | undefined,
  agent: Pick<Agent, "access"> | null | undefined,
): ModelSelectorDecision {
  if (agent == null) return { show: true, personal: false };
  if (!isMultiplayer(capabilities)) return { show: true, personal: false };
  if (capabilities?.teams === true) return { show: true, personal: true };
  return { show: canEditAgentConfig(capabilities, agent), personal: false };
}

/**
 * Whether `model` is within an agent's allowed-models ceiling.
 * `null`/`undefined` = no ceiling (every model allowed). Used to clamp the
 * picker's option list and to detect the single-allowed-model read-only case.
 */
export function isModelAllowed(
  allowedModels: string[] | null | undefined,
  model: string,
): boolean {
  if (allowedModels == null) return true;
  return allowedModels.includes(model);
}

/** A runnable provider/model/effort pin shown on the composer picker. */
export interface ModelPin {
  provider: string;
  model: string;
  effort?: string;
}

/**
 * The provider/model/effort the composer should DISPLAY in personal (Teams)
 * mode. The priority mirrors the gateway's per-turn clamp so the picker shows
 * what will actually run:
 *  1. the user's stored `choice` when present;
 *  2. else, when a ceiling exists and the shared `fallback` model is outside it,
 *     the ceiling's first model carried on the fallback provider (the gateway
 *     forces first-of-ceiling for a member who has not picked yet);
 *  3. else the shared `fallback` (agent / pod default) unchanged.
 */
export function resolvePersonalModelPin(
  choice: AgentModelChoice | null | undefined,
  allowedModels: string[] | null | undefined,
  fallback: ModelPin,
): ModelPin {
  if (choice)
    return {
      provider: choice.provider,
      model: choice.model,
      effort: choice.effort,
    };
  if (
    allowedModels != null &&
    allowedModels.length > 0 &&
    !allowedModels.includes(fallback.model)
  )
    return {
      provider: fallback.provider,
      model: allowedModels[0],
      effort: fallback.effort,
    };
  return fallback;
}
