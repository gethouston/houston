import { useState } from "react";
import { connectedProviderId } from "../components/onboarding/connect-ai-card-state";
import { newEngineActive } from "../lib/engine";
import { isFirstRun, onboardingRoute } from "../lib/onboarding-route";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCanCreateAgents } from "./use-can-create-agents";
import { useMigrationReconnect } from "./use-migration-reconnect";
import { useOnboardingFlags } from "./use-onboarding-flags";
import { useOnboardingSurvey } from "./use-onboarding-survey";
import { useProviderStatuses } from "./use-provider-statuses";

export function useFirstRunRouting() {
  const wsLoaded = useWorkspaceStore((s) => s.loaded);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentLoading = useAgentStore((s) => s.loading);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const {
    canCreate: canCreateAgents,
    isLoading: capabilitiesLoading,
    isError: capabilitiesError,
  } = useCanCreateAgents();

  const migrationReconnect = useMigrationReconnect();

  const survey = useOnboardingSurvey();
  const [firstRunSurveyDone, setFirstRunSurveyDone] = useState(false);
  const [completionPromptClosed, setCompletionPromptClosed] = useState(false);

  const {
    pendingStage,
    onboardingPendingLoading,
    onboardingCompleted,
    onboardingCompletedLoading,
  } = useOnboardingFlags(agents.length);

  const aiConnected = connectedProviderId(useProviderStatuses()) !== null;

  const bootGateActive =
    agentLoading ||
    !wsLoaded ||
    capabilitiesLoading ||
    onboardingPendingLoading ||
    onboardingCompletedLoading ||
    (newEngineActive() && !agentsLoaded);

  const firstRun = isFirstRun({
    controlPlane: newEngineActive(),
    workspaceCount: workspaces.length,
    agentCount: agents.length,
  });

  const surveyAnswered =
    firstRunSurveyDone ||
    (!survey.loading &&
      survey.roleAnswered &&
      survey.industryAnswered &&
      survey.companySizeAnswered &&
      survey.goalAnswered);
  const route = onboardingRoute({
    firstRun,
    pendingStage,
    onboardingCompleted,
    canCreateAgents,
    capabilitiesError,
    surveyAnswered,
    aiConnected,
  });

  const showSurveyPrompt =
    route === "app" &&
    !survey.loading &&
    survey.needsCompletionPrompt &&
    !completionPromptClosed;

  const routeLogLine =
    `[first-run] route=${route} firstRun=${firstRun} agents=${agents.length} ` +
    `completed=${onboardingCompleted} pending=${pendingStage} ` +
    `canCreate=${canCreateAgents} capErr=${capabilitiesError} surveyAnswered=${surveyAnswered} ` +
    `aiConnected=${aiConnected} ` +
    `surveyPrompt=${showSurveyPrompt}`;

  return {
    bootGateActive,
    route,
    showSurveyPrompt,
    survey,
    migrationReconnect,
    onFirstRunSurveyDone: () => setFirstRunSurveyDone(true),
    onCompletionPromptClosed: () => setCompletionPromptClosed(true),
    routeLogLine,
  };
}
