import { analytics } from "../../lib/analytics";
import type {
  OnboardingIndustry,
  OnboardingSegment,
} from "../../lib/onboarding-survey";
import {
  type OnboardingSurveyMode,
  type OnboardingSurveyStep,
  surveySourceScreen,
  surveyStepViewedEvent,
} from "./survey-steps";

/**
 * The survey's PostHog vocabulary, bound once to the screen it is mounted on.
 * Every event carries the same `source_screen`, so the first-run funnel and
 * the in-app prompt stay separable without the screen repeating itself at
 * seven call sites.
 */
export function createSurveyAnalytics(mode: OnboardingSurveyMode) {
  const source_screen = surveySourceScreen(mode);
  return {
    stepViewed: (step: OnboardingSurveyStep) =>
      analytics.track(surveyStepViewedEvent(step), { source_screen }),
    /** The in-app prompt opened, naming the gaps it opened for. */
    prompted: (missing: readonly OnboardingSurveyStep[]) =>
      analytics.track("onboarding_survey_prompted", {
        missing_steps: missing.join(","),
        source_screen,
      }),
    segmentSelected: (selected_segment: OnboardingSegment) =>
      analytics.track("onboarding_segment_selected", {
        selected_segment,
        source_screen,
      }),
    industrySelected: (selected_industry: OnboardingIndustry) =>
      analytics.track("onboarding_industry_selected", {
        selected_industry,
        source_screen,
      }),
    // The `*_continued` events are the CONFIRMED answers (they carry the person
    // properties), fired only once the save has landed, never on the
    // exploratory pill clicks above.
    segmentContinued: (selected_segment: OnboardingSegment) =>
      analytics.track("onboarding_segment_continued", {
        selected_segment,
        source_screen,
      }),
    industryContinued: (selected_industry: OnboardingIndustry) =>
      analytics.track("onboarding_industry_continued", {
        selected_industry,
        source_screen,
      }),
    // `goal_text` is the answer in the user's own words. `track` reads it only
    // to stamp the person property and strips it from the event itself, so the
    // free text never rides the wire as event content.
    goalContinued: (goal: string | null) =>
      analytics.track("onboarding_goal_continued", {
        goal_provided: goal !== null,
        ...(goal === null ? {} : { goal_text: goal }),
        source_screen,
      }),
  };
}
