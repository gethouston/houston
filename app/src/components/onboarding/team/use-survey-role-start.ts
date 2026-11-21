import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { loadOwnSurvey } from "../../../hooks/survey-load";
import { surveyQueryOptions } from "../../../hooks/survey-query";
import { useSession } from "../../../hooks/use-session";
import {
  surveyIndustryContext,
  surveyRoleContext,
} from "../../../lib/onboarding-industry-context";
import type { OnboardingSurveyPreference } from "../../../lib/onboarding-survey";
import type { AgentRoleStart } from "../../shell/use-agent-role-state";
import { surveyRoleStart } from "./team-industry";

export interface SurveyRoleStart {
  loading: boolean;
  start: AgentRoleStart;
}

export function useSurveyRoleStart(): SurveyRoleStart {
  const { data: session, isLoading: sessionLoading } = useSession();
  const uid = session?.uid ?? null;
  const query = useQuery<OnboardingSurveyPreference | null>({
    ...surveyQueryOptions(uid, () => loadOwnSurvey(uid)),
    enabled: false,
  });
  const record = query.data ?? null;
  const start = useMemo(
    () =>
      surveyRoleStart(surveyIndustryContext(record), surveyRoleContext(record)),
    [record],
  );
  return {
    loading:
      sessionLoading ||
      (query.data === undefined && query.fetchStatus === "fetching"),
    start,
  };
}
