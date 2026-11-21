import { type ReactNode, useEffect, useRef, useState } from "react";
import type { OnboardingSurveyState } from "../../../hooks/use-onboarding-survey";
import { useProviderStatuses } from "../../../hooks/use-provider-statuses";
import type { OnboardingRoute } from "../../../lib/onboarding-route";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import {
  connectedProviderId,
  shownOnboardingStep,
} from "../../onboarding/connect-ai-card-state";
import { useFirstRunOnboarding } from "../../onboarding/use-first-run-onboarding";
import { ASSISTANT_VIEW_ID } from "../id";
import {
  ManagerOnboardingProvider,
  type ManagerOnboardingState,
} from "./manager-onboarding-context";
import { useOwedTranscriptRetry } from "./use-onboarding-transcript";

interface HostProps {
  route: OnboardingRoute;
  survey: OnboardingSurveyState;
  showSurveyPrompt: boolean;
  onFirstRunSurveyDone: () => void;
  onCompletionPromptClosed: () => void;
  children: ReactNode;
}

export function ManagerOnboardingHost({
  route,
  survey,
  showSurveyPrompt,
  onFirstRunSurveyDone,
  onCompletionPromptClosed,
  children,
}: HostProps) {
  const finishRef = useRef<() => void>(() => {});
  useOwedTranscriptRetry();
  const [promptOpen, setPromptOpen] = useState(showSurveyPrompt);
  useEffect(() => {
    if (showSurveyPrompt) setPromptOpen(true);
  }, [showSurveyPrompt]);
  const profileOpen = route === "app" && (showSurveyPrompt || promptOpen);
  useOpenManagerOnce(route !== "app" || profileOpen);

  let value: ManagerOnboardingState | null = null;
  if (route !== "app")
    value = {
      mode: "first_run",
      stage: route,
      survey,
      onSurveyDone: onFirstRunSurveyDone,
      finish: () => finishRef.current(),
    };
  else if (profileOpen)
    value = {
      mode: "profile_completion",
      survey,
      close: () => {
        setPromptOpen(false);
        onCompletionPromptClosed();
      },
    };

  return (
    <ManagerOnboardingProvider value={value}>
      {route !== "app" ? (
        <FirstRunLifecycle
          route={route}
          surveyLoading={survey.loading}
          finishRef={finishRef}
        />
      ) : null}
      {children}
    </ManagerOnboardingProvider>
  );
}

function useOpenManagerOnce(active: boolean) {
  const opened = useRef(false);
  useEffect(() => {
    if (!active) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    useUIStore.getState().setViewMode(ASSISTANT_VIEW_ID, { nav: "replace" });
  }, [active]);
}

function FirstRunLifecycle({
  route,
  surveyLoading,
  finishRef,
}: {
  route: Exclude<OnboardingRoute, "app">;
  surveyLoading: boolean;
  finishRef: { current: () => void };
}) {
  const providerScan = useProviderStatuses();
  const hasWorkspace = useWorkspaceStore(
    (s) => (s.current?.id ?? null) !== null,
  );
  const shown = shownOnboardingStep({
    step: route,
    surveyLoading,
    statusesLoading: providerScan.isLoading,
    hasWorkspace,
  });
  const finish = useFirstRunOnboarding({
    shown,
    providerId: connectedProviderId(providerScan),
  });
  useEffect(() => {
    finishRef.current = finish;
  });
  return null;
}
