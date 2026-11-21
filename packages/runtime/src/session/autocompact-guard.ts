import { classifyProviderError } from "../ai/provider-error";
import { isExpectedProviderState } from "../ai/provider-error-log";
import type { HarnessSession } from "../backends/types";
import {
  compactWithFactHarvest,
  type FactHarvestTarget,
} from "./durable-facts-harvest";

const NOTHING_TO_COMPACT = /nothing to compact/i;

export function isNothingToCompact(message: string): boolean {
  return NOTHING_TO_COMPACT.test(message);
}

export const AUTOCOMPACT_COOLDOWN_MS = 5 * 60_000;

export interface AutocompactModel {
  provider: string;
  id: string;
}

export interface AutocompactCooldown {
  retryAfter(): number | undefined;
  hold(until: number): void;
}

const coolingUntil = new Map<string, number>();

function processCooldown(conversationId: string): AutocompactCooldown {
  return {
    retryAfter: () => coolingUntil.get(conversationId),
    hold: (until) => {
      coolingUntil.set(conversationId, until);
    },
  };
}

export function resetAutocompactCooldownsForTest(): void {
  coolingUntil.clear();
}

export async function runAutocompact(
  session: HarnessSession,
  conversationId: string,
  model: AutocompactModel,
  now: number = Date.now(),
  options: { cooldown?: AutocompactCooldown; harvest?: FactHarvestTarget } = {},
): Promise<boolean> {
  for (const [id, until] of coolingUntil) {
    if (until <= now) coolingUntil.delete(id);
  }
  const cooldown = options.cooldown ?? processCooldown(conversationId);
  const retryAfter = cooldown.retryAfter();
  if (retryAfter !== undefined && retryAfter > now) return false;
  try {
    await (options.harvest
      ? compactWithFactHarvest(session, conversationId, options.harvest)
      : compactWithFactHarvest(session, conversationId));
    return true;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    cooldown.hold(now + AUTOCOMPACT_COOLDOWN_MS);
    if (isNothingToCompact(why)) {
      console.info(
        `[autocompact] ${conversationId}: nothing to compact yet; the turn proceeds uncompacted:`,
        why,
      );
    } else {
      const line = `[autocompact] ${conversationId}: compaction failed; the turn proceeds uncompacted and no further attempt is made for ${AUTOCOMPACT_COOLDOWN_MS / 60_000} minutes:`;
      const failure = classifyProviderError({
        provider: model.provider,
        model: model.id,
        message: why,
      });
      if (isExpectedProviderState(failure)) {
        console.warn(`${line} provider refused (kind=${failure.kind}):`, why);
      } else {
        console.error(line, why);
      }
    }
    return false;
  }
}
