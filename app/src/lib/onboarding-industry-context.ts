import { type AgentContextId, isAgentContextId } from "./agent-role-catalog.ts";
import { ONBOARDING_INDUSTRY_SOMETHING_ELSE } from "./onboarding-industry.ts";
import type { OnboardingSurveyPreference } from "./onboarding-survey-record.ts";

/**
 * The person's industry as the hire flow's context question takes it: a
 * catalog context to preselect, or the words they gave for an industry the
 * catalog does not list. Both null means there is nothing to preselect (the
 * question is unanswered, or was declined).
 */
export interface SurveyIndustryContext {
  contextId: AgentContextId | null;
  customLabel: string | null;
}

const NO_INDUSTRY: SurveyIndustryContext = {
  contextId: null,
  customLabel: null,
};

export function surveyIndustryContext(
  record: Pick<OnboardingSurveyPreference, "industry" | "industryOther"> | null,
): SurveyIndustryContext {
  if (!record) return NO_INDUSTRY;
  if (isAgentContextId(record.industry))
    return { contextId: record.industry, customLabel: null };
  if (record.industry === ONBOARDING_INDUSTRY_SOMETHING_ELSE)
    return { contextId: null, customLabel: record.industryOther };
  return NO_INDUSTRY;
}
