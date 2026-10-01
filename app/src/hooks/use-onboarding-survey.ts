import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { isHostedGatewayEngine } from "../lib/engine";
import {
  applyCompanySize,
  applyCompletionDismissed,
  applyGoal,
  applyIndustry,
  applyRole,
  createOnboardingSurveyPreference,
  isCompanySizeAnswered,
  isGoalAnswered,
  isIndustryAnswered,
  isRoleAnswered,
  needsCompletionPrompt,
  type OnboardingCompanySizeChoice,
  type OnboardingIndustryChoice,
  type OnboardingRoleChoice,
  type OnboardingSurveyPreference,
} from "../lib/onboarding-survey";
import { liveSurveyStorePorts } from "../lib/onboarding-survey-ports";
import { persistSurveyPreference } from "../lib/onboarding-survey-store";
import { onboardingGatewayAvailable } from "../lib/onboarding-sync";
import { osIsTauri } from "../lib/os-bridge";
import { useSurveyGatewaySync } from "./onboarding-survey-flush";
import { loadOwnSurvey } from "./survey-load";
import { surveyKey, surveyQueryOptions } from "./survey-query";
import { useSession } from "./use-session";

/** Everything the survey screens need. Exactly ONE instance of the hook is
 *  live (App owns it) and this is what it hands down — see the catch-up in
 *  `./onboarding-survey-flush` for why a second instance would be a bug. */
export interface OnboardingSurveyState {
  loading: boolean;
  survey: OnboardingSurveyPreference | null;
  roleAnswered: boolean;
  industryAnswered: boolean;
  companySizeAnswered: boolean;
  goalAnswered: boolean;
  needsCompletionPrompt: boolean;
  saveIndustry: (
    industry: OnboardingIndustryChoice,
    other?: string | null,
  ) => Promise<void>;
  saveRole: (
    role: OnboardingRoleChoice,
    other?: string | null,
  ) => Promise<void>;
  saveCompanySize: (companySize: OnboardingCompanySizeChoice) => Promise<void>;
  /** A goal outside the accepted length throws — the UI blocks it long
   *  before this, and a caller bug must not vanish. The goal cannot be
   *  skipped. */
  saveGoal: (text: string) => Promise<void>;
  dismissCompletionPrompt: () => Promise<void>;
}

/**
 * The onboarding survey (industry · role · company size · automation goal) as
 * ONE resumable record: which questions are answered, whether the
 * profile-completion prompt is owed, and the saves. Every save persists locally first and pushes to
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
    ...surveyQueryOptions(uid, () => loadOwnSurvey(uid)),
    enabled: !sessionLoading,
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

  const saveIndustry = useCallback(
    (industry: OnboardingIndustryChoice, other: string | null = null) =>
      save((p) => applyIndustry(p, industry, other), true),
    [save],
  );

  const saveRole = useCallback(
    (role: OnboardingRoleChoice, other: string | null = null) =>
      save((p) => applyRole(p, role, other), true),
    [save],
  );

  const saveCompanySize = useCallback(
    (companySize: OnboardingCompanySizeChoice) =>
      save((p) => applyCompanySize(p, companySize), true),
    [save],
  );

  const saveGoal = useCallback(
    async (text: string) => {
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
    roleAnswered: isRoleAnswered(survey),
    industryAnswered: isIndustryAnswered(survey),
    companySizeAnswered: isCompanySizeAnswered(survey),
    goalAnswered: isGoalAnswered(survey),
    needsCompletionPrompt: needsCompletionPrompt(survey),
    saveIndustry,
    saveRole,
    saveCompanySize,
    saveGoal,
    dismissCompletionPrompt,
  };
}
