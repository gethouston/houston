import { onboardingPatchFromSurvey } from "./onboarding-gateway-record.ts";
import type { OnboardingSurveyPreference } from "./onboarding-survey.ts";

export function owesGatewayCatchUp(input: {
  survey: OnboardingSurveyPreference | null;
  uid: string | null;
  flushedUid: string | null | undefined;
  pendingFlush: string | null;
}): boolean {
  const { survey, uid, flushedUid, pendingFlush } = input;
  if (flushedUid !== undefined && flushedUid === uid) return false;
  if (!survey || survey.gatewaySyncedAt !== null) return false;
  if (pendingFlush !== null && pendingFlush === survey.updatedAt) return false;
  return onboardingPatchFromSurvey(survey) !== null;
}
