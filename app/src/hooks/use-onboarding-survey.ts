import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { isHostedGatewayEngine } from "../lib/engine";
import {
  applyCompletionDismissed,
  applyGoal,
  applyGoalSkipped,
  applyIndustry,
  applySegment,
  createOnboardingSurveyPreference,
  isGoalAnswered,
  isIndustryAnswered,
  isSegmentAnswered,
  needsCompletionPrompt,
  type OnboardingIndustryChoice,
  type OnboardingSegmentChoice,
  type OnboardingSurveyPreference,
} from "../lib/onboarding-survey";
import { liveSurveyStorePorts } from "../lib/onboarding-survey-ports";
import {
  loadSurveyPreference,
  persistSurveyPreference,
} from "../lib/onboarding-survey-store";
import { onboardingGatewayAvailable } from "../lib/onboarding-sync";
import { osIsTauri } from "../lib/os-bridge";
import { surveyKey, useSurveyGatewaySync } from "./onboarding-survey-flush";
import { useSession } from "./use-session";

/**
 * The record changes a handful of times in an account's whole life, and it is
 * read on every boot by the first-run gate. A long stale window plus no
 * refetch-on-focus keeps that to ONE round trip per app session instead of two
 * on every window focus, forever, for every user.
 */
const SURVEY_STALE_MS = 30 * 60_000;

/** Everything the survey screens need. Exactly ONE instance of the hook is
 *  live (App owns it) and this is what it hands down — see the catch-up in
 *  `./onboarding-survey-flush` for why a second instance would be a bug. */
export interface OnboardingSurveyState {
  loading: boolean;
  survey: OnboardingSurveyPreference | null;
  segmentAnswered: boolean;
  industryAnswered: boolean;
  goalAnswered: boolean;
  needsCompletionPrompt: boolean;
  saveSegment: (segment: OnboardingSegmentChoice) => Promise<void>;
  saveIndustry: (industry: OnboardingIndustryChoice) => Promise<void>;
  /** `null` records the skip. A goal outside the accepted length throws — the
   *  UI blocks it long before this, and a caller bug must not vanish. */
  saveGoal: (text: string | null) => Promise<void>;
  dismissCompletionPrompt: () => Promise<void>;
}

/**
 * The onboarding survey (segment · industry · automation goal) as ONE resumable
 * record: which questions are answered, whether the profile-completion prompt
 * is owed, and the four saves. Every save persists locally first and pushes to
 * the account store in the background — a failed push only leaves
 * `gatewaySyncedAt` null, which the next mount retries.
 *
 * MOUNT IT ONCE (App.tsx) and pass {@link OnboardingSurveyState} down: the
 * catch-up flush (`./onboarding-survey-flush`) is a side effect per hook
 * instance, so a second live instance would double every recovery PUT.
 */
export function useOnboardingSurvey(): OnboardingSurveyState {
  const qc = useQueryClient();
  const { data: session, isLoading: sessionLoading } = useSession();
  const uid = session?.uid ?? null;
  const gateway = onboardingGatewayAvailable({
    hostedGateway: isHostedGatewayEngine(),
    isTauri: osIsTauri(),
  });

  const query = useQuery({
    queryKey: surveyKey(uid),
    enabled: !sessionLoading,
    queryFn: () => loadSurveyPreference(uid, gateway, liveSurveyStorePorts),
    staleTime: SURVEY_STALE_MS,
    refetchOnWindowFocus: false,
  });
  const survey = query.data ?? null;
  const { flush, claim } = useSurveyGatewaySync({ uid, gateway, survey });

  /**
   * One save: revise the record, write it everywhere this device keeps it, and
   * — for an ANSWER — push it to the account store. `pushesAnswers` is false
   * for local UI state, which never leaves the device.
   */
  const save = useCallback(
    async (
      revise: (p: OnboardingSurveyPreference) => OnboardingSurveyPreference,
      pushesAnswers: boolean,
    ) => {
      const current =
        qc.getQueryData<OnboardingSurveyPreference | null>(surveyKey(uid)) ??
        createOnboardingSurveyPreference();
      const next = revise(current);
      // Claimed BEFORE the cache write, which re-renders and wakes the
      // catch-up: this save owns the push, and a second concurrent PUT would
      // also spend the once-per-account catch-up on an answer nobody dropped.
      if (pushesAnswers) claim(next);
      qc.setQueryData(surveyKey(uid), next);
      await persistSurveyPreference(uid, next, liveSurveyStorePorts);
      // The record, not the delta: `flush` sends everything it holds, so a save
      // that follows a failed one carries the dropped answer with it.
      if (pushesAnswers) void flush(next);
    },
    [claim, flush, qc, uid],
  );

  const saveSegment = useCallback(
    (segment: OnboardingSegmentChoice) =>
      save((p) => applySegment(p, segment), true),
    [save],
  );

  const saveIndustry = useCallback(
    (industry: OnboardingIndustryChoice) =>
      save((p) => applyIndustry(p, industry), true),
    [save],
  );

  const saveGoal = useCallback(
    async (text: string | null) => {
      if (text === null) {
        await save(applyGoalSkipped, true);
        return;
      }
      // An out-of-range goal is unreachable from the UI (Continue stays
      // disabled until it validates) and `applyGoal` throws on one, which the
      // caller surfaces. Never discard it quietly: a dropped answer that only
      // ever showed up in the console is a bug report we would never get.
      await save((p) => applyGoal(p, text), true);
    },
    [save],
  );

  // Local-only: the prompt's dismissal is this account's UI state, not an
  // answer, so it pushes nothing and leaves the record's sync stamp alone.
  const dismissCompletionPrompt = useCallback(
    () => save(applyCompletionDismissed, false),
    [save],
  );

  return {
    loading: sessionLoading || query.isPending,
    survey,
    segmentAnswered: isSegmentAnswered(survey),
    industryAnswered: isIndustryAnswered(survey),
    goalAnswered: isGoalAnswered(survey),
    needsCompletionPrompt: needsCompletionPrompt(survey),
    saveSegment,
    saveIndustry,
    saveGoal,
    dismissCompletionPrompt,
  };
}
