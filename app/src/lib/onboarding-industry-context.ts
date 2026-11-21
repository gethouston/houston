import {
  type AgentContextId,
  type AgentRoleId,
  isAgentContextId,
  isAgentRoleId,
} from "./agent-role-catalog.ts";
import {
  isLeadershipRoleId,
  type LeadershipRoleId,
} from "./leadership-roles.ts";
import { ONBOARDING_INDUSTRY_SOMETHING_ELSE } from "./onboarding-industry.ts";
import { ONBOARDING_ROLE_SOMETHING_ELSE } from "./onboarding-role.ts";
import type { OnboardingSurveyPreference } from "./onboarding-survey-record.ts";

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

export interface SurveyRoleContext {
  roleId: AgentRoleId | null;
  customLabel: string | null;
}

export const NO_SURVEY_ROLE: SurveyRoleContext = {
  roleId: null,
  customLabel: null,
};

export function surveyRoleContext(
  record: Pick<OnboardingSurveyPreference, "role" | "roleOther"> | null,
): SurveyRoleContext {
  if (!record) return NO_SURVEY_ROLE;
  if (isAgentRoleId(record.role))
    return { roleId: record.role, customLabel: null };
  if (record.role === ONBOARDING_ROLE_SOMETHING_ELSE)
    return { roleId: null, customLabel: record.roleOther };
  return NO_SURVEY_ROLE;
}

export function surveyLeadershipRole(
  record: Pick<OnboardingSurveyPreference, "role"> | null,
): LeadershipRoleId | null {
  const role = record?.role ?? null;
  return isLeadershipRoleId(role) ? role : null;
}
