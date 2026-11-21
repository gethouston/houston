import type { OnboardingSurveyPreference } from "./onboarding-survey-record.ts";

export function isRoleAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return (
    preference !== null &&
    (preference.role !== null || preference.segment !== null)
  );
}

export function isIndustryAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return preference !== null && preference.industry !== null;
}

export function isCompanySizeAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return preference !== null && preference.companySize !== null;
}

export function isGoalAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return (
    preference !== null &&
    (preference.automationGoal !== null || preference.goalSkipped)
  );
}

export function needsCompletionPrompt(
  preference: OnboardingSurveyPreference | null,
): boolean {
  if (preference === null || preference.completionPromptDismissed) return false;
  return (
    isRoleAnswered(preference) &&
    (!isIndustryAnswered(preference) ||
      !isCompanySizeAnswered(preference) ||
      !isGoalAnswered(preference))
  );
}
