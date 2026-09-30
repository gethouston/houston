import {
  ANTHROPIC_LINEUP,
  anthropicLineupModel,
} from "@houston/domain/model-aliases";

/**
 * The Claude lineup on the `anthropic` provider (a Claude subscription or API
 * key): one model per family, owned by `@houston/domain` (`ANTHROPIC_LINEUP`).
 * pi's `anthropic` catalog still lists older Claude rows; Houston runs none of
 * them.
 *
 * A turn never fails on a retired Claude id: agent configs, missions, routines
 * and turn bodies written before the lineup moved carry ids like
 * `claude-opus-4-8`, and each runs on its own family's lineup model (Opus stays
 * Opus). Only an id with no family in the lineup (Haiku) meets the ordinary
 * not-offered path.
 */

export const ANTHROPIC_PROVIDER_ID = "anthropic";

const LINEUP_IDS: readonly string[] = Object.values(ANTHROPIC_LINEUP);

/**
 * Narrow pi's `anthropic` catalog to the lineup, in lineup (picker) order, so
 * the status rows, the agent-facing model enum and the pin validator offer
 * exactly what the picker does. A lineup id pi does not ship is left out.
 */
export function anthropicOfferedModelIds(
  catalogIds: readonly string[],
): string[] {
  return LINEUP_IDS.filter((id) => catalogIds.includes(id));
}

/**
 * The model id a turn on `provider` (pi's canonical id) runs for `modelId`: on
 * `anthropic`, a Claude id's own family lineup model; otherwise the id as given.
 */
export function lineupModelId(provider: string, modelId: string): string {
  if (provider !== ANTHROPIC_PROVIDER_ID) return modelId;
  return anthropicLineupModel(modelId) ?? modelId;
}
