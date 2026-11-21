import {
  ONBOARDING_ANSWER_SKIPPED,
  ONBOARDING_ANSWER_SOMETHING_ELSE,
} from "@houston/wire-types";
import { type AgentContextId, isAgentContextId } from "./agent-role-catalog.ts";

export const ONBOARDING_INDUSTRY_SOMETHING_ELSE =
  ONBOARDING_ANSWER_SOMETHING_ELSE;

export type OnboardingIndustry =
  | AgentContextId
  | typeof ONBOARDING_INDUSTRY_SOMETHING_ELSE;

export const ONBOARDING_INDUSTRY_SKIPPED = ONBOARDING_ANSWER_SKIPPED;

export type OnboardingIndustryChoice =
  | OnboardingIndustry
  | typeof ONBOARDING_INDUSTRY_SKIPPED;

export const LEGACY_ONBOARDING_INDUSTRY_CONTEXTS = {
  technology: "software_it",
  finance: "finance",
  legal: "legal",
  healthcare: "healthcare",
  education: "education",
  retail: "retail_ecommerce",
  manufacturing: "manufacturing",
  real_estate: "real_estate",
  marketing_agencies: "marketing",
  government_nonprofit: "government",
  consulting: "consulting",
} as const satisfies Record<string, AgentContextId>;

export function isOnboardingIndustry(
  value: unknown,
): value is OnboardingIndustry {
  return (
    value === ONBOARDING_INDUSTRY_SOMETHING_ELSE || isAgentContextId(value)
  );
}

export function isOnboardingIndustryChoice(
  value: unknown,
): value is OnboardingIndustryChoice {
  return value === ONBOARDING_INDUSTRY_SKIPPED || isOnboardingIndustry(value);
}

function isLegacyIndustry(
  value: string,
): value is keyof typeof LEGACY_ONBOARDING_INDUSTRY_CONTEXTS {
  return Object.hasOwn(LEGACY_ONBOARDING_INDUSTRY_CONTEXTS, value);
}

export function normalizeOnboardingIndustryChoice(
  value: unknown,
): OnboardingIndustryChoice | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (isOnboardingIndustryChoice(value)) return value;
  if (isLegacyIndustry(value))
    return LEGACY_ONBOARDING_INDUSTRY_CONTEXTS[value];
  return ONBOARDING_INDUSTRY_SOMETHING_ELSE;
}
