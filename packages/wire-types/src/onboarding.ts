export const ONBOARDING_ANSWER_SKIPPED = "skipped";

export const ONBOARDING_ANSWER_SOMETHING_ELSE = "something_else";

export const ONBOARDING_INVALID_ROLE = "invalid_role";

export const ONBOARDING_COMPANY_SIZES = [
  "solo",
  "2_10",
  "11_50",
  "51_200",
  "201_1000",
  "1000_plus",
] as const;

export type OnboardingCompanySizeWire =
  (typeof ONBOARDING_COMPANY_SIZES)[number];

export interface OnboardingRecordWire {
  segment: string | null;
  role: string | null;
  industry: string | null;
  companySize: string | null;
  automationGoal: string | null;
  goalSkipped: boolean;
  segmentAnsweredAt: string | null;
  roleAnsweredAt: string | null;
  industryAnsweredAt: string | null;
  companySizeAnsweredAt: string | null;
  goalAnsweredAt: string | null;
}

export interface OnboardingUpdateWire {
  role?: string;
  industry?: string;
  companySize?: string;
  automationGoal?: string;
  goalSkipped?: boolean;
  segment?: string;
}
