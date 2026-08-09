import type { OnboardingIndustryChoice } from "./onboarding-industry.ts";
import type { OnboardingSegmentChoice } from "./onboarding-segment.ts";
import {
  isValidAutomationGoal,
  ONBOARDING_GOAL_MAX_LENGTH,
  type OnboardingSurveyPreference,
} from "./onboarding-survey-record.ts";

// This module is the survey's front door: the vocabulary (segment ids, industry
// ids) and the persisted record live in their own modules, consumers import
// everything from here.
export {
  isOnboardingIndustry,
  isOnboardingIndustryChoice,
  ONBOARDING_INDUSTRIES,
  ONBOARDING_INDUSTRY_SKIPPED,
  type OnboardingIndustry,
  type OnboardingIndustryChoice,
} from "./onboarding-industry.ts";
export {
  isOnboardingSegment,
  isOnboardingSegmentChoice,
  ONBOARDING_SEGMENT_SKIPPED,
  ONBOARDING_SEGMENTS,
  type OnboardingSegment,
  type OnboardingSegmentChoice,
} from "./onboarding-segment.ts";
export {
  createOnboardingSurveyPreference,
  isValidAutomationGoal,
  liftLegacySegmentPreference,
  markGatewaySynced,
  ONBOARDING_GOAL_MAX_LENGTH,
  ONBOARDING_SURVEY_PREF_KEY,
  ONBOARDING_SURVEY_VERSION,
  type OnboardingSurveyPreference,
  onboardingSurveyLocalKey,
  parseOnboardingSurveyPreference,
  sameSurveyAnswers,
  serializeOnboardingSurveyPreference,
} from "./onboarding-survey-record.ts";

/** The fields the gateway stores — the ANSWERS. */
type AnswerPatch = Partial<
  Pick<
    OnboardingSurveyPreference,
    "segment" | "industry" | "automationGoal" | "goalSkipped"
  >
>;

/** The fields that never leave this device — local UI state. */
type LocalStatePatch = Partial<
  Pick<OnboardingSurveyPreference, "completionPromptDismissed">
>;

// A new ANSWER invalidates the gateway copy: the sync stamp is cleared so the
// next flush knows this record is ahead of the server, and `updatedAt` moves
// because the content did.
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

// Local UI state is NOT content: it is never pushed, so touching the two sync
// fields would only lie. Clearing `gatewaySyncedAt` would order a full
// catch-up re-push on the next mount, and moving `updatedAt` would make an
// in-flight flush discard its own success (it stamps only the record it sent).
function reviseLocalState(
  preference: OnboardingSurveyPreference,
  patch: LocalStatePatch,
): OnboardingSurveyPreference {
  return { ...preference, ...patch };
}

export function applySegment(
  preference: OnboardingSurveyPreference,
  segment: OnboardingSegmentChoice,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, { segment });
}

export function applyIndustry(
  preference: OnboardingSurveyPreference,
  industry: OnboardingIndustryChoice,
): OnboardingSurveyPreference {
  return reviseAnswer(preference, { industry });
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

export function isSegmentAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return preference !== null && preference.segment !== null;
}

export function isIndustryAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return preference !== null && preference.industry !== null;
}

export function isGoalAnswered(
  preference: OnboardingSurveyPreference | null,
): boolean {
  return (
    preference !== null &&
    (preference.automationGoal !== null || preference.goalSkipped)
  );
}

/** The survey is resumable: an answered segment with a gap re-opens it once. */
export function needsCompletionPrompt(
  preference: OnboardingSurveyPreference | null,
): boolean {
  if (preference === null || preference.completionPromptDismissed) return false;
  return (
    isSegmentAnswered(preference) &&
    (!isIndustryAnswered(preference) || !isGoalAnswered(preference))
  );
}
