import type { OnboardingPendingStage } from "./onboarding-pending.ts";

export function isFirstRun(opts: {
  controlPlane: boolean;
  workspaceCount: number;
  agentCount: number;
}): boolean {
  return opts.controlPlane ? opts.agentCount === 0 : opts.workspaceCount === 0;
}

export type OnboardingRoute = "app" | "survey" | "connectAi" | "team";

export type OnboardingStep = Exclude<OnboardingRoute, "app">;

export interface OnboardingRouteInputs {
  firstRun: boolean;
  pendingStage: OnboardingPendingStage;
  onboardingCompleted: boolean;
  canCreateAgents: boolean;
  capabilitiesError: boolean;
  surveyAnswered: boolean;
  aiConnected: boolean;
}

export function onboardingRoute(opts: OnboardingRouteInputs): OnboardingRoute {
  if (!opts.canCreateAgents || opts.capabilitiesError) return "app";
  const inProgress =
    opts.pendingStage !== "none" ||
    (opts.firstRun && !opts.onboardingCompleted);
  if (!inProgress) return "app";
  if (opts.pendingStage !== "team" && !opts.aiConnected) return "connectAi";
  if (!opts.surveyAnswered) return "survey";
  return "team";
}
