import {
  ONBOARDING_ANSWER_SOMETHING_ELSE,
  type OnboardingRecordWire,
} from "@houston/wire-types";
import { normalizeOnboardingIndustryChoice } from "./onboarding-industry.ts";
import {
  createOnboardingSurveyPreference,
  isOnboardingCompanySizeChoice,
  isOnboardingIndustryChoice,
  isOnboardingRoleChoice,
  isValidAutomationGoal,
  normalizeOnboardingCompanySizeChoice,
  normalizeOnboardingRoleChoice,
  type OnboardingCompanySizeChoice,
  type OnboardingIndustryChoice,
  type OnboardingRoleChoice,
  type OnboardingSurveyPreference,
  sameSurveyAnswers,
} from "./onboarding-survey.ts";

export type GatewayOnboardingRecord = OnboardingRecordWire;

export interface OnboardingSyncPatch {
  role?: OnboardingRoleChoice;
  industry?: OnboardingIndustryChoice;
  companySize?: OnboardingCompanySizeChoice;
  automationGoal?: string;
  goalSkipped?: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseGatewayOnboarding(
  value: unknown,
): GatewayOnboardingRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    segment: asString(raw.segment),
    role: normalizeOnboardingRoleChoice(raw.role),
    industry: normalizeOnboardingIndustryChoice(raw.industry),
    companySize: normalizeOnboardingCompanySizeChoice(raw.companySize),
    automationGoal: isValidAutomationGoal(raw.automationGoal)
      ? raw.automationGoal.trim()
      : null,
    goalSkipped: raw.goalSkipped === true,
    segmentAnsweredAt: asString(raw.segmentAnsweredAt),
    roleAnsweredAt: asString(raw.roleAnsweredAt),
    industryAnsweredAt: asString(raw.industryAnsweredAt),
    companySizeAnsweredAt: asString(raw.companySizeAnsweredAt),
    goalAnsweredAt: asString(raw.goalAnsweredAt),
  };
}

export function sanitizeOnboardingPatch(
  patch: OnboardingSyncPatch,
  onInvalid: (reason: string) => void,
): OnboardingSyncPatch | null {
  const body: OnboardingSyncPatch = {};
  if (patch.role !== undefined) {
    if (isOnboardingRoleChoice(patch.role)) body.role = patch.role;
    else onInvalid(`dropped unknown role "${patch.role}"`);
  }
  if (patch.industry !== undefined) {
    if (isOnboardingIndustryChoice(patch.industry))
      body.industry = patch.industry;
    else onInvalid(`dropped unknown industry "${patch.industry}"`);
  }
  if (patch.companySize !== undefined) {
    if (isOnboardingCompanySizeChoice(patch.companySize))
      body.companySize = patch.companySize;
    else onInvalid(`dropped unknown company size "${patch.companySize}"`);
  }
  if (patch.automationGoal !== undefined) {
    if (isValidAutomationGoal(patch.automationGoal))
      body.automationGoal = patch.automationGoal.trim();
    else onInvalid("dropped out-of-range automation goal");
  }
  if (patch.goalSkipped !== undefined) body.goalSkipped = patch.goalSkipped;
  return Object.keys(body).length > 0 ? body : null;
}

function latestAnswerAt(remote: GatewayOnboardingRecord): string | null {
  const stamps = [
    remote.segmentAnsweredAt,
    remote.roleAnsweredAt,
    remote.industryAnsweredAt,
    remote.companySizeAnsweredAt,
    remote.goalAnsweredAt,
  ].filter((s): s is string => s !== null && !Number.isNaN(Date.parse(s)));
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

export function mergeGatewayOnboarding(
  local: OnboardingSurveyPreference | null,
  remote: GatewayOnboardingRecord | null,
): OnboardingSurveyPreference | null {
  if (!remote) return null;
  const base = local ?? createOnboardingSurveyPreference();
  const goalAnsweredLocally = base.automationGoal !== null || base.goalSkipped;
  const remoteGoal = remote.goalSkipped ? null : remote.automationGoal;
  const merged: OnboardingSurveyPreference = {
    ...base,
    segment: base.segment ?? remote.segment,
    role: base.role ?? normalizeOnboardingRoleChoice(remote.role),
    industry:
      base.industry ?? normalizeOnboardingIndustryChoice(remote.industry),
    companySize:
      base.companySize ??
      normalizeOnboardingCompanySizeChoice(remote.companySize),
    automationGoal: goalAnsweredLocally ? base.automationGoal : remoteGoal,
    goalSkipped: goalAnsweredLocally ? base.goalSkipped : remote.goalSkipped,
    updatedAt: local
      ? local.updatedAt
      : (latestAnswerAt(remote) ?? base.updatedAt),
    gatewaySyncedAt: local ? local.gatewaySyncedAt : new Date().toISOString(),
  };
  const before = local ?? createOnboardingSurveyPreference();
  return sameSurveyAnswers(before, merged) ? null : merged;
}

export function onboardingPatchFromSurvey(
  preference: OnboardingSurveyPreference,
): OnboardingSyncPatch | null {
  const patch: OnboardingSyncPatch = {};
  if (
    preference.role !== null &&
    !unnamedSomethingElse(preference.role, preference.roleOther)
  )
    patch.role = preference.role;
  if (
    preference.industry !== null &&
    !unnamedSomethingElse(preference.industry, preference.industryOther)
  )
    patch.industry = preference.industry;
  if (preference.companySize !== null)
    patch.companySize = preference.companySize;
  if (preference.automationGoal !== null)
    patch.automationGoal = preference.automationGoal;
  else if (preference.goalSkipped) patch.goalSkipped = true;
  return Object.keys(patch).length > 0 ? patch : null;
}

function unnamedSomethingElse(answer: string, words: string | null): boolean {
  return answer === ONBOARDING_ANSWER_SOMETHING_ELSE && !words?.trim();
}
