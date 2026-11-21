import {
  normalizeOnboardingCompanySizeChoice,
  type OnboardingCompanySizeChoice,
} from "./onboarding-company-size.ts";
import {
  normalizeOnboardingIndustryChoice,
  type OnboardingIndustryChoice,
} from "./onboarding-industry.ts";
import {
  normalizeOnboardingRoleChoice,
  type OnboardingRoleChoice,
} from "./onboarding-role.ts";

export const ONBOARDING_SURVEY_PREF_KEY = "houston_onboarding_survey";
export const ONBOARDING_SURVEY_VERSION = 2;
export const ONBOARDING_GOAL_MAX_LENGTH = 2000;
export const ONBOARDING_OTHER_MAX_LENGTH = 200;

export interface OnboardingSurveyPreference {
  version: typeof ONBOARDING_SURVEY_VERSION;
  segment: string | null;
  role: OnboardingRoleChoice | null;
  roleOther: string | null;
  industry: OnboardingIndustryChoice | null;
  industryOther: string | null;
  companySize: OnboardingCompanySizeChoice | null;
  automationGoal: string | null;
  goalSkipped: boolean;
  completionPromptDismissed: boolean;
  updatedAt: string;
  gatewaySyncedAt: string | null;
}

export function isValidAutomationGoal(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = [...value.trim()].length;
  return length > 0 && length <= ONBOARDING_GOAL_MAX_LENGTH;
}

export function isValidOtherText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = [...value.trim()].length;
  return length > 0 && length <= ONBOARDING_OTHER_MAX_LENGTH;
}

function otherTextOrNull(value: unknown): string | null {
  return isValidOtherText(value) ? value.trim() : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function legacySegmentOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

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
  const industry =
    record.industry === null
      ? null
      : normalizeOnboardingIndustryChoice(record.industry);
  if (record.industry !== null && industry === null) return null;
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
    segment: legacySegmentOrNull(record.segment),
    role: normalizeOnboardingRoleChoice(record.role),
    roleOther: otherTextOrNull(record.roleOther),
    industry,
    industryOther: otherTextOrNull(record.industryOther),
    companySize: normalizeOnboardingCompanySizeChoice(record.companySize),
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
    role: null,
    roleOther: null,
    industry: null,
    industryOther: null,
    companySize: null,
    automationGoal: null,
    goalSkipped: false,
    completionPromptDismissed: false,
    updatedAt: new Date().toISOString(),
    gatewaySyncedAt: null,
  };
}

export function sameSurveyAnswers(
  a: OnboardingSurveyPreference,
  b: OnboardingSurveyPreference,
): boolean {
  return (
    a.segment === b.segment &&
    a.role === b.role &&
    a.roleOther === b.roleOther &&
    a.industry === b.industry &&
    a.industryOther === b.industryOther &&
    a.companySize === b.companySize &&
    a.automationGoal === b.automationGoal &&
    a.goalSkipped === b.goalSkipped
  );
}

export function markGatewaySynced(
  preference: OnboardingSurveyPreference,
  syncedAt: string,
): OnboardingSurveyPreference {
  if (!isIsoTimestamp(syncedAt))
    throw new RangeError("gateway sync stamp must be an ISO 8601 timestamp");
  return { ...preference, gatewaySyncedAt: syncedAt };
}

export function onboardingSurveyLocalKey(uid: string | null): string {
  return `houston.onboarding-survey.${uid ?? "local"}`;
}
