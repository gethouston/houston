import { type AgentContextId, isAgentContextId } from "./agent-role-catalog.ts";
import { ONBOARDING_SEGMENT_SKIPPED } from "./onboarding-segment.ts";

/**
 * The survey asks the person's industry from the hire catalog's own contexts,
 * so the answer is an id the create flow can preselect when onboarding hires
 * their first AI Employee. "Something else" is the door out of the catalog,
 * captured with the person's own words (`industryOther`).
 */
export const ONBOARDING_INDUSTRY_SOMETHING_ELSE = "something_else";

export type OnboardingIndustry =
  | AgentContextId
  | typeof ONBOARDING_INDUSTRY_SOMETHING_ELSE;

// The same sentinel the segment question uses: a dismissal is a first-class
// stored answer, so the survey never re-asks someone who declined.
export const ONBOARDING_INDUSTRY_SKIPPED = ONBOARDING_SEGMENT_SKIPPED;

export type OnboardingIndustryChoice =
  | OnboardingIndustry
  | typeof ONBOARDING_INDUSTRY_SKIPPED;

/**
 * The survey's own twelve ids, which accounts that answered before the survey
 * spoke the catalog's vocabulary still hold, each folded into the context
 * nearest to it.
 */
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

/** Strict: the current vocabulary alone. Stored answers go through
 *  `normalizeOnboardingIndustryChoice`, which also reads the legacy ids. */
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

/**
 * A stored industry answer in the current vocabulary. A legacy survey id maps
 * to its nearest catalog context. Any other non-empty string is an industry
 * this build cannot name (a context a newer build added, or one the catalog
 * retired): the person DID answer, so it reads as "Something else" rather than
 * as a question to ask again. Anything that is not a string is not an answer.
 */
export function normalizeOnboardingIndustryChoice(
  value: unknown,
): OnboardingIndustryChoice | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (isOnboardingIndustryChoice(value)) return value;
  if (isLegacyIndustry(value))
    return LEGACY_ONBOARDING_INDUSTRY_CONTEXTS[value];
  return ONBOARDING_INDUSTRY_SOMETHING_ELSE;
}
