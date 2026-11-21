import type { OnboardingCompanySizeChoice } from "./onboarding-company-size.ts";
import type { OnboardingIndustryChoice } from "./onboarding-industry.ts";
import type { OnboardingRoleChoice } from "./onboarding-role.ts";
import {
  isValidAutomationGoal,
  ONBOARDING_GOAL_MAX_LENGTH,
  type OnboardingSurveyPreference,
} from "./onboarding-survey-record.ts";

export {
  isOnboardingCompanySize,
  isOnboardingCompanySizeChoice,
  normalizeOnboardingCompanySizeChoice,
  ONBOARDING_COMPANY_SIZE_IDS,
  ONBOARDING_COMPANY_SIZE_SKIPPED,
  type OnboardingCompanySize,
  type OnboardingCompanySizeChoice,
} from "./onboarding-company-size.ts";
export {
  isOnboardingIndustry,
  isOnboardingIndustryChoice,
  LEGACY_ONBOARDING_INDUSTRY_CONTEXTS,
  normalizeOnboardingIndustryChoice,
  ONBOARDING_INDUSTRY_SKIPPED,
  ONBOARDING_INDUSTRY_SOMETHING_ELSE,
  type OnboardingIndustry,
  type OnboardingIndustryChoice,
} from "./onboarding-industry.ts";
export { liftLegacySegmentPreference } from "./onboarding-legacy-segment.ts";
export {
  isOnboardingRole,
  isOnboardingRoleChoice,
  normalizeOnboardingRoleChoice,
  ONBOARDING_ROLE_SKIPPED,
  ONBOARDING_ROLE_SOMETHING_ELSE,
  type OnboardingRole,
  type OnboardingRoleChoice,
  type OnboardingRoleId,
} from "./onboarding-role.ts";
export {
  isCompanySizeAnswered,
  isGoalAnswered,
  isIndustryAnswered,
  isRoleAnswered,
  needsCompletionPrompt,
} from "./onboarding-survey-answered.ts";
export {
  createOnboardingSurveyPreference,
  isValidAutomationGoal,
  isValidOtherText,
  markGatewaySynced,
  ONBOARDING_GOAL_MAX_LENGTH,
  ONBOARDING_OTHER_MAX_LENGTH,
  ONBOARDING_SURVEY_PREF_KEY,
  ONBOARDING_SURVEY_VERSION,
  type OnboardingSurveyPreference,
  onboardingSurveyLocalKey,
  parseOnboardingSurveyPreference,
  sameSurveyAnswers,
  serializeOnboardingSurveyPreference,
} from "./onboarding-survey-record.ts";

type AnswerPatch = Partial<
  Pick<
    OnboardingSurveyPreference,
    | "role"
    | "roleOther"
    | "industry"
    | "industryOther"
    | "companySize"
    | "automationGoal"
    | "goalSkipped"
  >
>;

type LocalStatePatch = Partial<
  Pick<OnboardingSurveyPreference, "completionPromptDismissed">
>;

function reviseAnswer(
  preference: OnboardingSurveyPreference,
  patch: AnswerPatch,
): OnboardingSurveyPreference {
  return {
    ...preference,
    ...patch,
    updatedAt: new Date().toISOString(),
    gatewaySyncedAt: null,
  };
}

function reviseLocalState(
  preference: OnboardingSurveyPreference,
  patch: LocalStatePatch,
): OnboardingSurveyPreference {
  return { ...preference, ...patch };
}

export function applyRole(
  preference: OnboardingSurveyPreference,
  role: OnboardingRoleChoice,
  other: string | null = null,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, {
    role,
    roleOther: role === "something_else" ? (other?.trim() ?? null) : null,
  });
}

export function applyIndustry(
  preference: OnboardingSurveyPreference,
  industry: OnboardingIndustryChoice,
  other: string | null = null,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, {
    industry,
    industryOther:
      industry === "something_else" ? (other?.trim() ?? null) : null,
  });
}

export function applyCompanySize(
  preference: OnboardingSurveyPreference,
  companySize: OnboardingCompanySizeChoice,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, { companySize });
}

export function applyGoal(
  preference: OnboardingSurveyPreference,
  goal: string,
): OnboardingSurveyPreference {
  if (!isValidAutomationGoal(goal))
    throw new RangeError(
      `automation goal must be 1-${ONBOARDING_GOAL_MAX_LENGTH} characters once trimmed`,
    );
  return reviseAnswer(preference, {
    automationGoal: goal.trim(),
    goalSkipped: false,
  });
}

export function applyGoalSkipped(
  preference: OnboardingSurveyPreference,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, { automationGoal: null, goalSkipped: true });
}

export function applyCompletionDismissed(
  preference: OnboardingSurveyPreference,
): OnboardingSurveyPreference {
  return reviseLocalState(preference, { completionPromptDismissed: true });
}
