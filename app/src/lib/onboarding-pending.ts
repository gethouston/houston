export type OnboardingPendingStage = "none" | "started" | "team";

const STORED: Record<Exclude<OnboardingPendingStage, "none">, string> = {
  started: "first_run_started",
  team: "first_run_team",
};

export function parseOnboardingPending(
  raw: string | null | undefined,
): OnboardingPendingStage {
  const value = raw?.trim();
  if (value === STORED.started) return "started";
  if (value === STORED.team) return "team";
  return "none";
}

export function onboardingPendingValue(stage: OnboardingPendingStage): string {
  return stage === "none" ? "" : STORED[stage];
}
