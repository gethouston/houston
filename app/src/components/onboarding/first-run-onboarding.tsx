import type { OnboardingSurveyState } from "../../hooks/use-onboarding-survey";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import type { OnboardingStep } from "../../lib/onboarding-route";
import { useWorkspaceStore } from "../../stores/workspaces";
import { ClaudeBrowserLogin } from "../shell/claude-browser-login";
import { ProviderLoginFallback } from "../shell/provider-login-fallback";
import { WorkspaceLoading } from "../shell/workspace-loading";
import { ConnectAiCard } from "./connect-ai-card";
import {
  connectedProviderId,
  shownOnboardingStep,
} from "./connect-ai-card-state";
import { OnboardingSurveyScreen } from "./survey-screen";
import { BuildTeamCard } from "./team/build-team-card";
import { useFirstRunOnboarding } from "./use-first-run-onboarding";

interface FirstRunOnboardingProps {
  /** The screen the first-run route (`onboardingRoute`) says is current. */
  step: OnboardingStep;
  /** The app's single survey instance (see `OnboardingSurveyScreen`). */
  survey: OnboardingSurveyState;
  /** Every survey question is answered; App latches it across the save gap. */
  onSurveyComplete: () => void;
}

/**
 * The first-run onboarding, outside the app shell: the survey, then
 * "Connect your AI", then "Build your team", then the app. ONE element for all
 * three screens on purpose: it stays mounted as the route advances, so the
 * funnel ({@link useFirstRunOnboarding}) sees each hand-over.
 */
export function FirstRunOnboarding({
  step,
  survey,
  onSurveyComplete,
}: FirstRunOnboardingProps) {
  const providerScan = useProviderStatuses();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);

  const shown = shownOnboardingStep({
    step,
    surveyLoading: survey.loading,
    statusesLoading: providerScan.isLoading,
    hasWorkspace: workspaceId !== null,
  });

  const finish = useFirstRunOnboarding({
    shown,
    providerId: connectedProviderId(providerScan),
  });

  if (shown === "survey") {
    // The three questions are mandatory: the first-run survey renders no
    // skip affordance (profile_completion keeps its "Not now").
    return (
      <OnboardingSurveyScreen
        mode="first_run"
        survey={survey}
        onComplete={onSurveyComplete}
      />
    );
  }
  if (shown === "connectAi") {
    return (
      <>
        <ProviderLoginFallback />
        <ClaudeBrowserLogin />
        <ConnectAiCard />
      </>
    );
  }
  if (shown === "team" && workspaceId !== null) {
    return (
      <BuildTeamCard
        workspaceId={workspaceId}
        mode="first_run"
        onDone={finish}
      />
    );
  }
  return <WorkspaceLoading />;
}
