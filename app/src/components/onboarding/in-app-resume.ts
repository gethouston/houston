import type { InAppStep } from "./in-app-onboarding-flow";

/**
 * Where an interrupted in-app setup picks up, pure so it unit-tests without
 * React (`app/tests/in-app-resume.test.ts`).
 *
 * `onboarding_pending` brings a quit-mid-setup user back INTO the flow, but
 * the flow used to restart at its welcome beat every time. On a phone that is
 * not a rare path: leaving the tab to fetch a sign-in code (claude.ai, an
 * authenticator) is enough for the browser to evict and reload the page, and
 * the user came back to "Start setup" with the paste dialog gone. The current
 * step is mirrored on the device and the run re-enters at the last SAFE beat
 * of the sequence it was in — a spot step re-armed by its own intro or
 * sidebar beat, never a step whose in-memory prerequisites (the agent-count
 * baseline, the send discipline, an open dialog) the reload dropped.
 */
export function resumeStepFor(saved: string | null | undefined): InAppStep {
  switch (saved) {
    case "welcome":
    case "connectAiIntro":
    case "integrationsIntro":
    case "createAgentIntro":
    case "agentCreated":
    case "sendMissionIntro":
    case "academyReveal":
      return saved;
    // The AI sequence: the sidebar beat self-advances on the hub, and the
    // connect beat re-snapshots whether the AI got connected while away.
    case "openAiHub":
    case "connectAi":
    case "aiConnected":
      return "openAiHub";
    case "openIntegrations":
    case "connectIntegration":
    case "integrationConnected":
      return "openIntegrations";
    // The intro's "Show me" seeds the agent-count baseline the spot needs.
    case "createAgent":
    case "createAgentDialog":
      return "createAgentIntro";
    // The intro's "Show me" re-arms the send discipline and the email task.
    case "sendMission":
    case "missionSent":
    case "emailSending":
    case "emailSent":
      return "sendMissionIntro";
    default:
      return "welcome";
  }
}

/** Per-user device key for the mirrored step; `null` uid = the local user. */
export function inAppResumeKey(uid: string | null): string {
  return `houston.onboarding.in-app-step.${uid ?? "local"}`;
}
