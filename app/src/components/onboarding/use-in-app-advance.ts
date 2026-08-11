import { useEffect } from "react";
import { analytics } from "../../lib/analytics";
import { fireSetupConfetti } from "../../lib/confetti";
import {
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  isActiveTopLevelView,
} from "../../lib/top-level-views";
import {
  type InAppStep,
  inAppOnboardingAdvance,
} from "./in-app-onboarding-flow";
import type { useGuidedEmailTask } from "./use-guided-email-task";
import type { useInAppOnboardingSignals } from "./use-in-app-signals";
import type { useSendMissionDiscipline } from "./use-send-mission-discipline";

/**
 * The in-app onboarding's machine effect: it feeds the app's live signals to
 * the pure step machine ({@link inAppOnboardingAdvance}) and carries out what
 * the machine says — the step move itself, the arrival snapshots that decide
 * whether a step renders its already-done addendum, the funnel analytics, the
 * guided email task's hand-offs, and the celebration confetti.
 *
 * Split out of {@link import("./use-in-app-onboarding").useInAppOnboarding},
 * which keeps the state and the actions the render files call.
 */
export function useInAppAdvance(args: {
  step: InAppStep;
  setStep: (step: InAppStep) => void;
  viewMode: string;
  createDialogOpen: boolean;
  signals: ReturnType<typeof useInAppOnboardingSignals>;
  email: ReturnType<typeof useGuidedEmailTask>;
  send: ReturnType<typeof useSendMissionDiscipline>;
  arrivedAiConnected: boolean;
  setArrivedAiConnected: (arrived: boolean) => void;
  arrivedIntegrationConnected: boolean;
  setArrivedIntegrationConnected: (arrived: boolean) => void;
  baselineAgentCount: number | null;
}): void {
  const {
    step,
    setStep,
    viewMode,
    createDialogOpen,
    signals,
    email,
    send,
    arrivedAiConnected,
    setArrivedAiConnected,
    arrivedIntegrationConnected,
    setArrivedIntegrationConnected,
    baselineAgentCount,
  } = args;

  // Act on what the machine says the live signals mean.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the machine's inputs are the real dependencies; the celebrate branch reads the rest once at its guarded transition.
  useEffect(() => {
    const advance = inAppOnboardingAdvance(step, {
      onAiHub: isActiveTopLevelView(viewMode, AI_HUB_VIEW_ID),
      aiConnected: signals.aiConnected,
      arrivedAiConnected,
      onIntegrations: isActiveTopLevelView(viewMode, INTEGRATIONS_VIEW_ID),
      integrationConnected: signals.integrationConnected,
      arrivedIntegrationConnected,
      agentCreated:
        baselineAgentCount !== null && signals.agentCount > baselineAgentCount,
      missionSent: send.missionSent,
      createDialogOpen,
      emailMode: email.armed,
      emailSent: send.emailSent,
    });
    if (advance.kind === "stay") return;
    if (advance.kind === "goto") {
      if (advance.step === "connectAi")
        setArrivedAiConnected(signals.aiConnected);
      if (advance.step === "connectIntegration")
        setArrivedIntegrationConnected(signals.integrationConnected);
      if (advance.step === "emailSending") {
        analytics.track("first_message_sent");
        email.onSent();
      }
      setStep(advance.step);
      return;
    }
    // celebrate — with confetti over the shell the user is looking at.
    if (advance.step === "aiConnected") {
      analytics.track("ai_provider_connected", {
        provider: signals.connectedProviderId,
      });
    }
    if (advance.step === "agentCreated") email.captureCreatedAgent();
    if (advance.step === "missionSent") {
      // Reached from the send itself, or from the email fallback — either
      // way the send happened and the composer is the user's again.
      analytics.track("first_message_sent");
      email.onSent();
    }
    if (advance.step === "emailSent") email.completed();
    fireSetupConfetti();
    setStep(advance.step);
  }, [
    step,
    viewMode,
    createDialogOpen,
    signals.aiConnected,
    arrivedAiConnected,
    signals.integrationConnected,
    arrivedIntegrationConnected,
    signals.agentCount,
    baselineAgentCount,
    send.missionSent,
    email.armed,
    send.emailSent,
  ]);
}
