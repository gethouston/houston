export const ONBOARDING_SEGMENT_PREF_KEY = "houston_onboarding_segment";
export const ONBOARDING_SEGMENT_SOURCE_SCREEN = "first_run_segment";

export const ONBOARDING_SEGMENTS = [
  "business_owner",
  "growth",
  "hobbyist",
  "consulting",
  "ecommerce",
  "operations",
  "legal",
  "finance_accounting",
  "other",
] as const;

export type OnboardingSegment = (typeof ONBOARDING_SEGMENTS)[number];

export interface OnboardingSegmentPreference {
  segment: OnboardingSegment;
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

export function parseOnboardingSegmentPreference(
  raw: string | null,
): OnboardingSegmentPreference | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<OnboardingSegmentPreference>;
    if (
      isOnboardingSegment(record.segment) &&
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
  segment: OnboardingSegment,
): OnboardingSegmentPreference {
  return {
    segment,
    selectedAt: new Date().toISOString(),
    sourceScreen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
  };
}
