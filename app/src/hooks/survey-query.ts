import type { OnboardingSurveyPreference } from "../lib/onboarding-survey.ts";

const SURVEY_STALE_MS = 30 * 60_000;

export const surveyKey = (uid: string | null) =>
  ["onboarding-survey", uid] as const;

export function surveyQueryOptions(
  uid: string | null,
  load: () => Promise<OnboardingSurveyPreference | null>,
) {
  return {
    queryKey: surveyKey(uid),
    queryFn: load,
    staleTime: SURVEY_STALE_MS,
    refetchOnWindowFocus: false,
  };
}
