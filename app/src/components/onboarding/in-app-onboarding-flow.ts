/**
 * The in-app onboarding's step machine, pure so it unit-tests without React
 * (`app/tests/in-app-onboarding-flow.test.ts`). The component observes the
 * app's live signals and asks this function what the tutorial should do —
 * spot steps advance on the app's own state; center cards and the
 * already-done addenda advance by their own button.
 *
 * EVERY user walks EVERY step and every step keeps its full teaching — the
 * tutorial shows WHERE things live, so nothing is skipped for being already
 * done. A goal already met when the user ARRIVES at its step gets an in-place
 * addendum with a skip button (never a replaced step); only a goal met DURING
 * the step celebrates.
 */

/** Center cards: welcome, the intros, the celebrations. Spots: the sidebar
 *  rows, the two connect surfaces, the New-agent row and the New-task button. */
export type InAppStep =
  | "welcome"
  | "connectAiIntro"
  | "openAiHub"
  | "connectAi"
  | "aiConnected"
  | "integrationsIntro"
  | "openIntegrations"
  | "connectIntegration"
  | "integrationConnected"
  | "createAgentIntro"
  | "createAgent"
  | "createAgentDialog"
  | "agentCreated"
  | "sendMissionIntro"
  | "sendMission"
  | "missionSent"
  | "emailSending"
  | "emailSent";

export interface InAppSignals {
  /** The AI hub is the active top-level view. */
  onAiHub: boolean;
  /** Some provider is CONFIRMED connected (the shared derivation, HOU-979). */
  aiConnected: boolean;
  /** Whether the AI was already connected when the user REACHED the connect
   *  step — the component snapshots it at that transition. */
  arrivedAiConnected: boolean;
  /** The Integrations view is the active top-level view. */
  onIntegrations: boolean;
  /** Some integration account is active (the shared connections query). */
  integrationConnected: boolean;
  /** Snapshot of `integrationConnected` at the connect-integration arrival. */
  arrivedIntegrationConnected: boolean;
  /** The agent roster grew SINCE the create-agent step was entered (the
   *  component compares against its arrival baseline). */
  agentCreated: boolean;
  /** The cross-agent mission list grew SINCE the send step was entered. */
  missionSent: boolean;
  /** The create-agent dialog is open (ui store). */
  createDialogOpen: boolean;
  /** The guided first task is the prewritten email variant (an email toolkit
   *  is connected and the tutorial created the agent). */
  emailMode: boolean;
  /** The guided mission's feed carries the completion marker — the agent
   *  actually sent the email. */
  emailSent: boolean;
}

export type InAppAdvance =
  /** Nothing to do; the current step stays up (buttons may still advance). */
  | { kind: "stay" }
  /** The taught action happened — move to this step. */
  | { kind: "goto"; step: InAppStep }
  /** A goal met DURING its step — move to this celebration beat. */
  | {
      kind: "celebrate";
      step:
        | "aiConnected"
        | "integrationConnected"
        | "agentCreated"
        | "missionSent"
        | "emailSent";
    };

export function inAppOnboardingAdvance(
  step: InAppStep,
  signals: InAppSignals,
): InAppAdvance {
  switch (step) {
    // Narration beats never auto-advance; their button does.
    case "welcome":
    case "connectAiIntro":
    case "aiConnected":
    case "integrationsIntro":
    case "integrationConnected":
    case "createAgentIntro":
    case "agentCreated":
    case "sendMissionIntro":
    case "missionSent":
    case "emailSent":
      return { kind: "stay" };
    case "openAiHub":
      return signals.onAiHub
        ? { kind: "goto", step: "connectAi" }
        : { kind: "stay" };
    case "connectAi":
      // An arrival that was already connected holds for the addendum's own
      // skip — an old connection is not news to celebrate.
      return !signals.arrivedAiConnected && signals.aiConnected
        ? { kind: "celebrate", step: "aiConnected" }
        : { kind: "stay" };
    case "openIntegrations":
      return signals.onIntegrations
        ? { kind: "goto", step: "connectIntegration" }
        : { kind: "stay" };
    case "connectIntegration":
      return !signals.arrivedIntegrationConnected &&
        signals.integrationConnected
        ? { kind: "celebrate", step: "integrationConnected" }
        : { kind: "stay" };
    // Both baselines are arrival snapshots, so these are inherently
    // "during the step" — an existing agent or mission never fires them.
    case "createAgent":
      if (signals.agentCreated)
        return { kind: "celebrate", step: "agentCreated" };
      return signals.createDialogOpen
        ? { kind: "goto", step: "createAgentDialog" }
        : { kind: "stay" };
    case "createAgentDialog":
      // Coached INSIDE the real dialog; bailing out of the dialog returns to
      // the New-agent spot rather than stranding a coach chip over nothing.
      if (signals.agentCreated)
        return { kind: "celebrate", step: "agentCreated" };
      return signals.createDialogOpen
        ? { kind: "stay" }
        : { kind: "goto", step: "createAgent" };
    case "sendMission":
      if (!signals.missionSent) return { kind: "stay" };
      // The email variant is not done at send: the agent still has to
      // actually SEND the email — hold on the working beat until it does.
      return signals.emailMode
        ? { kind: "goto", step: "emailSending" }
        : { kind: "celebrate", step: "missionSent" };
    case "emailSending":
      if (signals.emailSent) return { kind: "celebrate", step: "emailSent" };
      // The email arming can fail AFTER the send (the priming write raced
      // it): emailMode drops, the marker can never arrive — fall back to the
      // plain sent finale instead of waiting forever.
      return signals.emailMode
        ? { kind: "stay" }
        : { kind: "celebrate", step: "missionSent" };
  }
}
