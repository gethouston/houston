import {
  isOnboardingSegment,
  type OnboardingSegment,
  type OnboardingSegmentChoice,
} from "../../lib/onboarding-segment";

/**
 * Maps a first-run onboarding segment to the SET of first-party store agent
 * packs that fit that role, so a new user is seeded with a small team of
 * role-relevant agents (one agent per pack) instead of a single one-size-fits-
 * all assistant. The founder's requirement is "a set of agents", and each
 * `store/agents/<id>` pack is a single agent, so a segment lists every pack the
 * role should ship with.
 *
 * The values are `store/agents/<id>` pack ids (see `STORE_TEMPLATE_IDS` /
 * `store-catalog.ts`), each loaded on create via `loadStoreTemplate`. An empty
 * array means "no pack fits" — those segments fall back to the generic
 * personal-assistant seeds, so a user is never left worse off than before this
 * mapping existed.
 *
 * Exhaustive over `OnboardingSegment` on purpose: adding a segment forces a
 * decision here at compile time.
 */
export const SEGMENT_AGENT_PACK: Record<OnboardingSegment, string[]> = {
  marketing: ["marketing", "outbound"],
  product: [],
  legal: ["legal", "operations"],
  engineering: [],
  student: [],
  design: [],
  operations: ["operations", "support"],
  people_hr: ["people", "operations"],
  data_science: [],
  finance: ["bookkeeping", "operations"],
  sales: ["sales", "outbound"],
  something_else: [],
};

/**
 * The store pack ids for a stored segment choice, in seed order (the first is
 * the primary assistant surfaced during onboarding; the rest become their own
 * agents). Empty when the segment has no matching pack, or the answer was
 * skipped / absent — the caller then seeds the generic personal assistant.
 */
export function agentPacksForSegment(
  segment: OnboardingSegmentChoice | null | undefined,
): string[] {
  if (!segment || !isOnboardingSegment(segment)) return [];
  return SEGMENT_AGENT_PACK[segment];
}
