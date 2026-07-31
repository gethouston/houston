import {
  isOnboardingSegment,
  type OnboardingSegment,
  type OnboardingSegmentChoice,
} from "../../lib/onboarding-segment";

/**
 * Maps a first-run onboarding segment to the first-party store agent pack that
 * best fits that role, so the default assistant is seeded with role-relevant
 * skills/routines/instructions instead of the one-size-fits-all briefing.
 *
 * The values are `store/agents/<id>` pack ids (see `STORE_TEMPLATE_IDS` /
 * `store-catalog.ts`), loaded on create via `loadStoreTemplate`. A `null` means
 * "no pack fits" — those segments fall back to the generic personal-assistant
 * seeds, so a user is never left worse off than before this mapping existed.
 *
 * Exhaustive over `OnboardingSegment` on purpose: adding a segment forces a
 * decision here at compile time. Packs `outbound` and `support` exist but have
 * no matching segment, so they are intentionally unmapped.
 */
export const SEGMENT_AGENT_PACK: Record<OnboardingSegment, string | null> = {
  marketing: "marketing",
  product: null,
  legal: "legal",
  engineering: null,
  student: null,
  design: null,
  operations: "operations",
  people_hr: "people",
  data_science: null,
  finance: "bookkeeping",
  sales: "sales",
  something_else: null,
};

/**
 * The store pack id for a stored segment choice, or `null` when the segment has
 * no matching pack (or the answer was skipped / absent) — the caller then seeds
 * the generic personal assistant.
 */
export function agentPackForSegment(
  segment: OnboardingSegmentChoice | null | undefined,
): string | null {
  if (!segment || !isOnboardingSegment(segment)) return null;
  return SEGMENT_AGENT_PACK[segment];
}
