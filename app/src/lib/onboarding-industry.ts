import { ONBOARDING_SEGMENT_SKIPPED } from "./onboarding-segment.ts";

export const ONBOARDING_INDUSTRIES = [
  "technology",
  "finance",
  "legal",
  "healthcare",
  "education",
  "retail",
  "manufacturing",
  "real_estate",
  "marketing_agencies",
  "government_nonprofit",
  "consulting",
  "something_else",
] as const;

export type OnboardingIndustry = (typeof ONBOARDING_INDUSTRIES)[number];

// The same sentinel the segment question uses: a dismissal is a first-class
// stored answer, so the survey never re-asks someone who declined.
export const ONBOARDING_INDUSTRY_SKIPPED = ONBOARDING_SEGMENT_SKIPPED;

export type OnboardingIndustryChoice =
  | OnboardingIndustry
  | typeof ONBOARDING_INDUSTRY_SKIPPED;

export function isOnboardingIndustry(
  value: unknown,
): value is OnboardingIndustry {
  return (
    typeof value === "string" &&
    (ONBOARDING_INDUSTRIES as readonly string[]).includes(value)
  );
}

export function isOnboardingIndustryChoice(
  value: unknown,
): value is OnboardingIndustryChoice {
  return value === ONBOARDING_INDUSTRY_SKIPPED || isOnboardingIndustry(value);
}
