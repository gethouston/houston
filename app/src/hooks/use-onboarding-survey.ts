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
  saveGoal: (text: string) => Promise<void>;
  dismissCompletionPrompt: () => Promise<void>;
}

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

  const save = useCallback(
    async (
      revise: (p: OnboardingSurveyPreference) => OnboardingSurveyPreference,
      pushesAnswers: boolean,
    ) => {
      const current =
        qc.getQueryData<OnboardingSurveyPreference | null>(surveyKey(uid)) ??
        createOnboardingSurveyPreference();
      const next = revise(current);
      if (pushesAnswers) claim(next);
      qc.setQueryData(surveyKey(uid), next);
      await persistSurveyPreference(uid, next, liveSurveyStorePorts);
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
      await save((p) => applyGoal(p, text), true);
    },
    [save],
  );

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
