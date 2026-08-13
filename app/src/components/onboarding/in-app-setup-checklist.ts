import type { InAppStep } from "./in-app-onboarding-flow";
/** The setup checklist the center cards show — the minimum Houston needs,
 *  with live done/current states so the flow reads as a REQUIRED setup
 *  completing, never a skippable tour. */
export type SetupChecklistId = "ai" | "apps" | "agent" | "task";

export interface SetupChecklistItem {
  id: SetupChecklistId;
  state: "done" | "current" | "todo";
}

/** How far the flow has progressed, as "items completed". Skipped-because-
 *  already-done counts as done — the checklist states facts, not effort. */
function completedCount(step: InAppStep): number {
  switch (step) {
    case "welcome":
    case "connectAiIntro":
    case "openAiHub":
    case "connectAi":
      return 0;
    case "aiConnected":
    case "integrationsIntro":
    case "openIntegrations":
    case "connectIntegration":
      return 1;
    case "integrationConnected":
    case "createAgentIntro":
    case "createAgent":
    case "createAgentDialog":
      return 2;
    case "agentCreated":
    case "sendMissionIntro":
    case "sendMission":
    case "emailSending":
      return 3;
    case "missionSent":
    case "emailSent":
    case "academyReveal":
      return 4;
  }
}

export function inAppSetupChecklist(
  step: InAppStep,
  gates: { integrationsOn: boolean; canCreateAgents: boolean },
): SetupChecklistItem[] {
  const ranks: Array<{ id: SetupChecklistId; rank: number }> = [
    { id: "ai", rank: 1 },
    ...(gates.integrationsOn ? [{ id: "apps" as const, rank: 2 }] : []),
    ...(gates.canCreateAgents
      ? [
          { id: "agent" as const, rank: 3 },
          { id: "task" as const, rank: 4 },
        ]
      : []),
  ];
  const done = completedCount(step);
  let currentMarked = false;
  return ranks.map(({ id, rank }) => {
    if (rank <= done) return { id, state: "done" };
    if (!currentMarked) {
      currentMarked = true;
      return { id, state: "current" };
    }
    return { id, state: "todo" };
  });
}
