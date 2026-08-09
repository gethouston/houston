// `.ts` extension so the node test runner (extensionless ESM can't resolve)
// can import this pure helper directly, matching the repo's tested-module
// convention.
import { ONBOARDING_SEGMENT_SOURCE_SCREEN } from "../../lib/onboarding-segment.ts";

/**
 * Pure step logic for the onboarding survey, extracted so the progression, the
 * analytics source screen, and the "what is still missing" report are unit
 * testable without rendering React.
 *
 * The survey asks three questions in this order. The ids are the analytics and
 * preference vocabulary (`segment` is the job question), so a plan can be
 * reported verbatim as the `missing_steps` prop.
 */
export const ONBOARDING_SURVEY_STEPS = ["segment", "industry", "goal"] as const;

export type OnboardingSurveyStep = (typeof ONBOARDING_SURVEY_STEPS)[number];

/**
 * Where the survey is being shown: the first-run intro (all three questions,
 * before the create-your-assistant flow) or the in-app prompt that re-opens it
 * for someone who only ever answered the job question.
 */
export type OnboardingSurveyMode = "first_run" | "profile_completion";

/** The answered flags the survey hook exposes, in step order. */
export interface OnboardingSurveyAnswered {
  segmentAnswered: boolean;
  industryAnswered: boolean;
  goalAnswered: boolean;
}

const ANSWERED_FLAG: Record<
  OnboardingSurveyStep,
  keyof OnboardingSurveyAnswered
> = {
  segment: "segmentAnswered",
  industry: "industryAnswered",
  goal: "goalAnswered",
};

const STEP_VIEWED_EVENT = {
  segment: "onboarding_segment_screen_viewed",
  industry: "onboarding_industry_screen_viewed",
  goal: "onboarding_goal_screen_viewed",
} as const;

/** The questions still unanswered, in ask order. */
export function missingSurveySteps(
  answered: OnboardingSurveyAnswered,
): OnboardingSurveyStep[] {
  return ONBOARDING_SURVEY_STEPS.filter(
    (step) => !answered[ANSWERED_FLAG[step]],
  );
}

/**
 * Which questions this mounting asks. The first-run intro always walks the
 * whole survey (a resumed first run keeps its earlier answers preselected);
 * the in-app prompt only fills the gaps, so nobody is re-asked what they
 * already answered.
 */
export function surveyStepPlan(
  mode: OnboardingSurveyMode,
  answered: OnboardingSurveyAnswered,
): OnboardingSurveyStep[] {
  if (mode === "first_run") return [...ONBOARDING_SURVEY_STEPS];
  return missingSurveySteps(answered);
}

/**
 * PostHog's `source_screen` for this mounting. The first-run value is the one
 * the segmentation screen has always sent, so its funnel stays continuous
 * across this rewrite.
 */
export function surveySourceScreen(mode: OnboardingSurveyMode): string {
  return mode === "first_run"
    ? ONBOARDING_SEGMENT_SOURCE_SCREEN
    : "profile_completion";
}

/** The `*_screen_viewed` event a step fires when it becomes the visible one. */
export function surveyStepViewedEvent(
  step: OnboardingSurveyStep,
): (typeof STEP_VIEWED_EVENT)[OnboardingSurveyStep] {
  return STEP_VIEWED_EVENT[step];
}
