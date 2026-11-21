import { ONBOARDING_ANSWER_SKIPPED } from "@houston/wire-types";
import {
  isCompanySizeAnswered,
  isGoalAnswered,
  isIndustryAnswered,
  isOnboardingCompanySize,
  isRoleAnswered,
  type OnboardingCompanySize,
  type OnboardingSurveyPreference,
} from "../onboarding-survey.ts";
import type { SurveyQuestion } from "./script-types.ts";

export const SURVEY_SKIPPED = ONBOARDING_ANSWER_SKIPPED;

export function surveyAnswered(
  record: OnboardingSurveyPreference | null,
  question: SurveyQuestion,
): boolean {
  if (question === "industry") return isIndustryAnswered(record);
  if (question === "role") return isRoleAnswered(record);
  if (question === "companySize") return isCompanySizeAnswered(record);
  return isGoalAnswered(record);
}

function withWords(id: string | null, words: string | null): string | null {
  return id === "something_else" && words !== null ? words : id;
}

export function surveyAnswer(
  record: OnboardingSurveyPreference | null,
  question: SurveyQuestion,
): string | null {
  if (!record) return null;
  if (question === "industry")
    return withWords(record.industry, record.industryOther);
  if (question === "role") return withWords(record.role, record.roleOther);
  if (question === "companySize") return record.companySize;
  if (record.automationGoal !== null) return record.automationGoal;
  return record.goalSkipped ? SURVEY_SKIPPED : null;
}

export function surveyAbout(record: OnboardingSurveyPreference | null): {
  industry: string | null;
  role: string | null;
  companySize: OnboardingCompanySize | null;
} {
  const role = surveyAnswer(record, "role");
  const industry = surveyAnswer(record, "industry");
  const size = record?.companySize ?? null;
  return {
    industry:
      industry === null ||
      industry === SURVEY_SKIPPED ||
      industry === "something_else"
        ? null
        : industry,
    role:
      role === null || role === SURVEY_SKIPPED || role === "something_else"
        ? null
        : role,
    companySize: isOnboardingCompanySize(size) ? size : null,
  };
}
