export const ONBOARDING_SEGMENT_PREF_KEY = "houston_onboarding_segment";
export const ONBOARDING_SEGMENT_SOURCE_SCREEN = "first_run_segment";

export const ONBOARDING_SEGMENTS = [
  "marketing",
  "product",
  "legal",
  "engineering",
  "student",
  "design",
  "operations",
  "people_hr",
  "data_science",
  "finance",
  "sales",
  "something_else",
] as const;

export type OnboardingSegment = (typeof ONBOARDING_SEGMENTS)[number];

// Persisted when the user dismisses the question instead of answering it.
// A first-class stored value (not an absent pref) so the screen never
// re-prompts a skipper, and analytics can cohort them.
export const ONBOARDING_SEGMENT_SKIPPED = "skipped";

export type OnboardingSegmentChoice =
  | OnboardingSegment
  | typeof ONBOARDING_SEGMENT_SKIPPED;

export interface OnboardingSegmentPreference {
  segment: OnboardingSegmentChoice;
  selectedAt: string;
  sourceScreen: typeof ONBOARDING_SEGMENT_SOURCE_SCREEN;
}

export function isOnboardingSegment(
  value: unknown,
): value is OnboardingSegment {
  return (
    typeof value === "string" &&
    (ONBOARDING_SEGMENTS as readonly string[]).includes(value)
  );
}

export function isOnboardingSegmentChoice(
  value: unknown,
): value is OnboardingSegmentChoice {
  return value === ONBOARDING_SEGMENT_SKIPPED || isOnboardingSegment(value);
}

export function parseOnboardingSegmentPreference(
  raw: string | null,
): OnboardingSegmentPreference | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<OnboardingSegmentPreference>;
    if (
      isOnboardingSegmentChoice(record.segment) &&
      typeof record.selectedAt === "string" &&
      record.sourceScreen === ONBOARDING_SEGMENT_SOURCE_SCREEN
    ) {
      return {
        segment: record.segment,
        selectedAt: record.selectedAt,
        sourceScreen: record.sourceScreen,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function createOnboardingSegmentPreference(
  segment: OnboardingSegmentChoice,
): OnboardingSegmentPreference {
  return {
    segment,
    selectedAt: new Date().toISOString(),
    sourceScreen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
  };
}
