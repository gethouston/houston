import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { surveyKey } from "../../../hooks/onboarding-survey-flush";
import { useSession } from "../../../hooks/use-session";
import { surveyIndustryContext } from "../../../lib/onboarding-industry-context";
import type { OnboardingSurveyPreference } from "../../../lib/onboarding-survey";
import type { AgentRoleStart } from "../../shell/use-agent-role-state";
import { surveyRoleStart } from "./team-industry";

export interface SurveyRoleStart {
  /** The record is still arriving: the industry question must wait for it,
   *  since it only takes its starting answer when it opens. */
  loading: boolean;
  start: AgentRoleStart;
}

/**
 * The person's survey industry, as the hire flow's opening answer.
 *
 * A READER of the record App's one `useOnboardingSurvey` owns: the observer
 * never fetches (`enabled: false`), so the owner's load and its catch-up push
 * stay the only ones. A record the owner never managed to load reads as no
 * industry at all, and the question simply opens blank.
 */
export function useSurveyRoleStart(): SurveyRoleStart {
  const { data: session, isLoading: sessionLoading } = useSession();
  const query = useQuery<OnboardingSurveyPreference | null>({
    queryKey: surveyKey(session?.uid ?? null),
    enabled: false,
  });
  const record = query.data ?? null;
  const start = useMemo(
    () => surveyRoleStart(surveyIndustryContext(record)),
    [record],
  );
  return {
    loading:
      sessionLoading ||
      (query.data === undefined && query.fetchStatus === "fetching"),
    start,
  };
}
