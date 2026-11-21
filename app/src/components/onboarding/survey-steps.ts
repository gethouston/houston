export const ONBOARDING_SURVEY_STEPS = [
  "industry",
  "role",
  "companySize",
  "goal",
] as const;

export type OnboardingSurveyStep = (typeof ONBOARDING_SURVEY_STEPS)[number];

export function isSurveyQuestion(value: string): value is OnboardingSurveyStep {
  return (ONBOARDING_SURVEY_STEPS as readonly string[]).includes(value);
}

export type OnboardingSurveyMode = "first_run" | "profile_completion";

export interface OnboardingSurveyAnswered {
  industryAnswered: boolean;
  roleAnswered: boolean;
  companySizeAnswered: boolean;
  goalAnswered: boolean;
}

const ANSWERED_FLAG: Record<
  OnboardingSurveyStep,
  keyof OnboardingSurveyAnswered
> = {
  industry: "industryAnswered",
  role: "roleAnswered",
  companySize: "companySizeAnswered",
  goal: "goalAnswered",
};

const STEP_VIEWED_EVENT = {
  industry: "onboarding_industry_screen_viewed",
  role: "onboarding_role_screen_viewed",
  companySize: "onboarding_company_size_screen_viewed",
  goal: "onboarding_goal_screen_viewed",
} as const;

export function missingSurveySteps(
  answered: OnboardingSurveyAnswered,
): OnboardingSurveyStep[] {
  return ONBOARDING_SURVEY_STEPS.filter(
    (step) => !answered[ANSWERED_FLAG[step]],
  );
}

export function surveyStepPlan(
  mode: OnboardingSurveyMode,
  answered: OnboardingSurveyAnswered,
): OnboardingSurveyStep[] {
  if (mode === "first_run") return [...ONBOARDING_SURVEY_STEPS];
  return missingSurveySteps(answered);
}

const FIRST_RUN_SURVEY_SOURCE_SCREEN = "first_run_role";

export function surveySourceScreen(mode: OnboardingSurveyMode): string {
  return mode === "first_run"
    ? FIRST_RUN_SURVEY_SOURCE_SCREEN
    : "profile_completion";
}

export function surveyStepViewedEvent(
  step: OnboardingSurveyStep,
): (typeof STEP_VIEWED_EVENT)[OnboardingSurveyStep] {
  return STEP_VIEWED_EVENT[step];
}
