// `.ts` extensions so the node test runner can import this module directly.
import type { OnboardingSurveyPreference } from "../lib/onboarding-survey.ts";

/**
 * The record changes a handful of times in an account's whole life, and it is
 * read on every boot by the first-run gate. A long stale window plus no
 * refetch-on-focus keeps that to ONE round trip per app session instead of two
 * on every window focus, forever, for every user.
 */
const SURVEY_STALE_MS = 30 * 60_000;

/** Where the record lives in the query cache. */
export const surveyKey = (uid: string | null) =>
  ["onboarding-survey", uid] as const;

/**
 * The survey record's query, for its owner (`useOnboardingSurvey`) and every
 * reader alike, each passing `loadOwnSurvey` (`./survey-load`). A reader
 * observes with `enabled: false` and never fetches, yet still carries the
 * load: the query keeps the options of whichever observer mounted last, and a
 * refetch through it (an invalidation) with no load would fail and leave the
 * record unrefreshed.
 */
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
