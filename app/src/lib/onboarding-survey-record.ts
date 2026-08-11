import {
  isOnboardingIndustryChoice,
  type OnboardingIndustryChoice,
} from "./onboarding-industry.ts";
import {
  isOnboardingSegmentChoice,
  type OnboardingSegmentChoice,
  type OnboardingSegmentPreference,
} from "./onboarding-segment.ts";

export const ONBOARDING_SURVEY_PREF_KEY = "houston_onboarding_survey";
export const ONBOARDING_SURVEY_VERSION = 2;
/** Max length of the automation goal, in Unicode CODE POINTS — the unit the
 *  gateway counts (Go runes). Counting UTF-16 units instead would refuse an
 *  emoji answer the server accepts. */
export const ONBOARDING_GOAL_MAX_LENGTH = 2000;
/** Max length of a "Something else" free-text answer, in code points. */
export const ONBOARDING_OTHER_MAX_LENGTH = 200;

export interface OnboardingSurveyPreference {
  version: typeof ONBOARDING_SURVEY_VERSION;
  segment: OnboardingSegmentChoice | null;
  /** What "Something else" stands for, in the user's words — captured with the
   *  pick, null for every named segment. */
  segmentOther: string | null;
  industry: OnboardingIndustryChoice | null;
  industryOther: string | null;
  automationGoal: string | null;
  goalSkipped: boolean;
  completionPromptDismissed: boolean;
  updatedAt: string;
  /** ISO of the last successful gateway PUT; null means the record is unsynced. */
  gatewaySyncedAt: string | null;
}

export function isValidAutomationGoal(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Spread, not `.length`: an astral character (emoji) is ONE code point to the
  // gateway and two UTF-16 units here, and the two counts must agree.
  const length = [...value.trim()].length;
  return length > 0 && length <= ONBOARDING_GOAL_MAX_LENGTH;
}

export function isValidOtherText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = [...value.trim()].length;
  return length > 0 && length <= ONBOARDING_OTHER_MAX_LENGTH;
}

/** The "other" fields parse LENIENTLY (absent or malformed → null): records
 *  written before the fields existed must keep parsing, and a mangled label
 *  is not worth re-asking three answered questions for. */
function otherTextOrNull(value: unknown): string | null {
  return isValidOtherText(value) ? value.trim() : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * All-or-nothing, like the segment parser: an unknown id or a missing field
 * means the stored blob is not ours, and re-asking the survey beats rendering
 * a half-trusted record. Every field must be present — the writer always emits
 * the full shape, with explicit nulls for unanswered questions.
 */
export function parseOnboardingSurveyPreference(
  raw: string | null,
): OnboardingSurveyPreference | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<OnboardingSurveyPreference>;
  if (record.version !== ONBOARDING_SURVEY_VERSION) return null;
  if (record.segment !== null && !isOnboardingSegmentChoice(record.segment))
    return null;
  if (record.industry !== null && !isOnboardingIndustryChoice(record.industry))
    return null;
  if (
    record.automationGoal !== null &&
    !isValidAutomationGoal(record.automationGoal)
  )
    return null;
  if (typeof record.goalSkipped !== "boolean") return null;
  if (typeof record.completionPromptDismissed !== "boolean") return null;
  if (!isIsoTimestamp(record.updatedAt)) return null;
  if (
    record.gatewaySyncedAt !== null &&
    !isIsoTimestamp(record.gatewaySyncedAt)
  )
    return null;
  return {
    version: ONBOARDING_SURVEY_VERSION,
    segment: record.segment,
    segmentOther: otherTextOrNull(record.segmentOther),
    industry: record.industry,
    industryOther: otherTextOrNull(record.industryOther),
    automationGoal: record.automationGoal?.trim() ?? null,
    goalSkipped: record.goalSkipped,
    completionPromptDismissed: record.completionPromptDismissed,
    updatedAt: record.updatedAt,
    gatewaySyncedAt: record.gatewaySyncedAt,
  };
}

export function serializeOnboardingSurveyPreference(
  preference: OnboardingSurveyPreference,
): string {
  return JSON.stringify(preference);
}

export function createOnboardingSurveyPreference(): OnboardingSurveyPreference {
  return {
    version: ONBOARDING_SURVEY_VERSION,
    segment: null,
    segmentOther: null,
    industry: null,
    industryOther: null,
    automationGoal: null,
    goalSkipped: false,
    completionPromptDismissed: false,
    updatedAt: new Date().toISOString(),
    gatewaySyncedAt: null,
  };
}

/**
 * Whether two copies of the record hold the same ANSWERS — the four fields the
 * account store keeps. Everything else (`updatedAt`, the sync stamp, the
 * dismissal) is metadata about them, so this is the predicate that decides
 * whether a stamp still describes what it was written for.
 */
export function sameSurveyAnswers(
  a: OnboardingSurveyPreference,
  b: OnboardingSurveyPreference,
): boolean {
  return (
    a.segment === b.segment &&
    a.segmentOther === b.segmentOther &&
    a.industry === b.industry &&
    a.industryOther === b.industryOther &&
    a.automationGoal === b.automationGoal &&
    a.goalSkipped === b.goalSkipped
  );
}

/** Stamps a successful gateway PUT; not a content change, so `updatedAt` holds. */
export function markGatewaySynced(
  preference: OnboardingSurveyPreference,
  syncedAt: string,
): OnboardingSurveyPreference {
  if (!isIsoTimestamp(syncedAt))
    throw new RangeError("gateway sync stamp must be an ISO 8601 timestamp");
  return { ...preference, gatewaySyncedAt: syncedAt };
}

/**
 * Per-user localStorage key for the device-local mirror. Same reasoning as the
 * segment mirror: the engine pref lives on the user's pod in hosted mode, so a
 * pod blip must not re-prompt an answered survey, and keying by uid keeps two
 * accounts on one machine independent.
 */
export function onboardingSurveyLocalKey(uid: string | null): string {
  return `houston.onboarding-survey.${uid ?? "local"}`;
}

/**
 * Builds a v2 survey record from the pre-survey `houston_onboarding_segment`
 * pref. The legacy pref stays where it is (rollback safety); the survey record
 * becomes the only thing read from here on.
 */
export function liftLegacySegmentPreference(
  legacy: OnboardingSegmentPreference | null,
): OnboardingSurveyPreference | null {
  if (!legacy) return null;
  return {
    ...createOnboardingSurveyPreference(),
    segment: legacy.segment,
    // The legacy parser only type-checked `selectedAt`, so an unparseable stamp
    // falls back to the factory's `now` rather than minting a record our own
    // strict parser would then reject.
    updatedAt: isIsoTimestamp(legacy.selectedAt)
      ? legacy.selectedAt
      : new Date().toISOString(),
  };
}
