import { analytics } from "../../lib/analytics";
import type {
  OnboardingCompanySize,
  OnboardingIndustry,
  OnboardingRole,
} from "../../lib/onboarding-survey";
import {
  type OnboardingSurveyMode,
  type OnboardingSurveyStep,
  surveySourceScreen,
  surveyStepViewedEvent,
} from "./survey-steps";

export function createSurveyAnalytics(mode: OnboardingSurveyMode) {
  const source_screen = surveySourceScreen(mode);
  return {
    stepViewed: (step: OnboardingSurveyStep) =>
      analytics.track(surveyStepViewedEvent(step), { source_screen }),
    prompted: (missing: readonly OnboardingSurveyStep[]) =>
      analytics.track("onboarding_survey_prompted", {
        missing_steps: missing.join(","),
        source_screen,
      }),
    industrySelected: (selected_industry: OnboardingIndustry) =>
      analytics.track("onboarding_industry_selected", {
        selected_industry,
        source_screen,
      }),
    roleSelected: (selected_role: OnboardingRole) =>
      analytics.track("onboarding_role_selected", {
        selected_role,
        source_screen,
      }),
    industryContinued: (selected_industry: OnboardingIndustry) =>
      analytics.track("onboarding_industry_continued", {
        selected_industry,
        source_screen,
      }),
    roleContinued: (selected_role: OnboardingRole) =>
      analytics.track("onboarding_role_continued", {
        selected_role,
        source_screen,
      }),
    companySizeContinued: (selected_company_size: OnboardingCompanySize) =>
      analytics.track("onboarding_company_size_continued", {
        selected_company_size,
        source_screen,
      }),
    goalContinued: (goal: string) =>
      analytics.track("onboarding_goal_continued", {
        goal_provided: true,
        goal_text: goal,
        source_screen,
      }),
  };
}
