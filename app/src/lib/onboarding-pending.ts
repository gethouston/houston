/**
 * How far an interrupted first-run onboarding got, as the `onboarding_pending`
 * engine preference stores it:
 *
 * - `"none"`: no first run in flight.
 * - `"started"`: a run began; the survey or the AI connection is still owed.
 * - `"team"`: the run reached the team card. It stays there even when the AI
 *   provider drops mid-card, so a flapping connection never unmounts the card
 *   while its hires are being created.
 */
export type OnboardingPendingStage = "none" | "started" | "team";

const STORED: Record<Exclude<OnboardingPendingStage, "none">, string> = {
  started: "first_run_started",
  team: "first_run_team",
};

/**
 * The stage a stored value names. Anything else reads as `"none"`, including
 * the `"1"` the in-app tutorial stored under the same key: those accounts
 * already have AI Employees and no first run to resume.
 */
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
