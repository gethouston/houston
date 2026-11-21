import {
  ONBOARDING_ANSWER_SKIPPED,
  ONBOARDING_COMPANY_SIZES,
  type OnboardingCompanySizeWire,
} from "@houston/wire-types";

export const ONBOARDING_COMPANY_SIZE_IDS = ONBOARDING_COMPANY_SIZES;

export type OnboardingCompanySize = OnboardingCompanySizeWire;

export const ONBOARDING_COMPANY_SIZE_SKIPPED = ONBOARDING_ANSWER_SKIPPED;

export type OnboardingCompanySizeChoice =
  | OnboardingCompanySize
  | typeof ONBOARDING_COMPANY_SIZE_SKIPPED;

export function isOnboardingCompanySize(
  value: unknown,
): value is OnboardingCompanySize {
  return (
    typeof value === "string" &&
    (ONBOARDING_COMPANY_SIZE_IDS as readonly string[]).includes(value)
  );
}

export function isOnboardingCompanySizeChoice(
  value: unknown,
): value is OnboardingCompanySizeChoice {
  return (
    value === ONBOARDING_COMPANY_SIZE_SKIPPED || isOnboardingCompanySize(value)
  );
}

export function normalizeOnboardingCompanySizeChoice(
  value: unknown,
): OnboardingCompanySizeChoice | null {
  return isOnboardingCompanySizeChoice(value) ? value : null;
}
