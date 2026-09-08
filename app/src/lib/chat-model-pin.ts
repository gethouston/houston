/**
 * The ONE source of truth for the provider + model pair the chat composer
 * displays and forwards on send.
 *
 * The picker's glyph and its label used to be derived separately: the provider
 * from the mission's activity pin, the model from a chain that fell through to
 * the AGENT's configured model and finally to `getDefaultModel`'s hardcoded
 * Anthropic id. A mission pinned to Codex therefore rendered the OpenAI mark
 * beside `claude-sonnet-4-6` — a pair no provider can run, and not what the
 * turn ran on. Both halves now come from the same source, or the label falls
 * back to the SETTLED PROVIDER's own default; a model can never travel from one
 * provider onto another.
 *
 * Precedence, strongest evidence first:
 *  1. the mission's pin (the activity row) — what this conversation was pinned
 *     to and what its next turn will run on;
 *  2. the agent's configured model choice;
 *  3. the deployment default — the settled provider's own catalog default.
 * Only a source that names the SETTLED provider may name the model (a source
 * with no provider qualifies when the catalog positively places its model on
 * that provider). Everything else falls to the provider's default, and, when
 * the catalog cannot name one, to no model at all — an empty label is honest,
 * another provider's model id is not.
 *
 * The settled provider comes from `resolveEffectiveProvider`, which owns the
 * orthogonal auth question (freeze mid-conversation, never open a fresh chat on
 * a signed-out provider). This module only decides which model belongs beside it.
 *
 * NOTE: the frames the runtime publishes carry no record of the provider+model
 * a turn ACTUALLY ran on (`usage` is token counts; `provider_switched` names
 * only a provider, only when a switch happened), so no surface can show the
 * as-run pair without a protocol/SDK field to read. This is the pin that will
 * run, which is the strongest claim the client can currently make.
 */

import { toDisplayProviderId } from "./provider-overrides.ts";
import { getModel, getProvider, isOpenCatalogProvider } from "./providers.ts";

/** Which of the three tiers above named the model. */
export type ChatModelPinSource = "mission" | "agent" | "deployment";

/** A provider/model pair as one source stored it. Either half may be absent. */
export interface ChatModelRef {
  provider: string | null;
  model: string | null;
}

/** The resolved pair, plus the tier that decided it. */
export interface ChatModelPin {
  provider: string;
  model: string;
  source: ChatModelPinSource;
}

/** The catalog questions this resolution asks, injected so it stays testable. */
export interface PinCatalog {
  /**
   * Whether the catalog fails to RULE OUT `model` on `provider`. Deliberately
   * permissive: an uncatalogued provider, one whose models have not hydrated
   * yet, and an open-catalog gateway all answer `true`, because replacing an id
   * the catalog merely cannot see would name a model the turn will not run on.
   */
  runs(provider: string, model: string): boolean;
  /**
   * Whether the catalog POSITIVELY lists `model` under `provider`. Asked only to
   * attribute a source that stored a model with no provider — guessing there
   * would recreate the mismatch this module exists to prevent.
   */
  offers(provider: string, model: string): boolean;
  /** `provider`'s own default model; `""` when the catalog does not know it. */
  defaultModel(provider: string): string;
}

/** The live (hydrated) provider catalog. */
export const LIVE_PIN_CATALOG: PinCatalog = {
  runs(provider, model) {
    if (isOpenCatalogProvider(provider)) return true;
    const info = getProvider(provider);
    if (!info || info.models.length === 0) return true;
    return info.models.some((m) => m.id === model);
  },
  offers(provider, model) {
    return getModel(provider, model) !== undefined;
  },
  defaultModel(provider) {
    return getProvider(provider)?.defaultModel ?? "";
  },
};

/** Whether `ref` speaks for `provider` — see the precedence in the module doc. */
function names(
  ref: ChatModelRef,
  provider: string,
  catalog: PinCatalog,
): boolean {
  if (ref.provider) return toDisplayProviderId(ref.provider) === provider;
  // Rows stored before pins carried a provider: theirs counts only where the
  // catalog places that model on the settled provider itself.
  return !!ref.model && catalog.offers(provider, ref.model);
}

/**
 * The pair to show for a conversation, given the provider that settled for it.
 *
 * `provider` and both refs are accepted in either dialect — activity rows and
 * agent configs store pi's canonical id (`openai-codex`) while the catalog,
 * picker and logos speak Houston's display id (`openai`) — and the resolved
 * pair is always in the display dialect the UI renders.
 */
export function resolveChatModelPin(
  provider: string,
  mission: ChatModelRef,
  agent: ChatModelRef,
  catalog: PinCatalog = LIVE_PIN_CATALOG,
): ChatModelPin {
  const settled = toDisplayProviderId(provider);
  const tiers: [ChatModelPinSource, ChatModelRef][] = [
    ["mission", mission],
    ["agent", agent],
  ];
  for (const [source, ref] of tiers) {
    if (!names(ref, settled, catalog)) continue;
    if (ref.model && catalog.runs(settled, ref.model))
      return { provider: settled, model: ref.model, source };
  }
  return {
    provider: settled,
    model: catalog.defaultModel(settled),
    source: "deployment",
  };
}

/**
 * Keep an already-resolved pair coherent: a model the settled provider cannot
 * run falls back to that provider's own default, never to another provider's
 * model. The guard for pairs assembled elsewhere (the Teams personal-choice
 * resolution), which read a stored model without re-checking it belongs.
 */
export function coherentPinModel(
  provider: string,
  model: string,
  catalog: PinCatalog = LIVE_PIN_CATALOG,
): string {
  if (model && catalog.runs(provider, model)) return model;
  return catalog.defaultModel(provider) || model;
}
