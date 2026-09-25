import { useEffect } from "react";
import { useOnboardingCompleted } from "./use-onboarding-completed";
import { useOnboardingPending } from "./use-onboarding-pending";

/**
 * The two durable onboarding flags the first-run gate routes on, plus the
 * boot backfill that stamps pre-flag users completed.
 */
export function useOnboardingFlags(agentCount: number) {
  // Onboarding in progress: a durable stage recorded when first-run
  // onboarding starts (and again when it reaches the team card), cleared when
  // the team card finishes. Hiring the first AI
  // Employee flips `isFirstRun` (agent count), so this flag is what keeps the
  // user on the team card and re-enters onboarding for a user who quit
  // mid-flow. Its load joins the splash so a returning, fully-onboarded user
  // never flashes into onboarding.
  const { stage: pendingStage, isLoading: onboardingPendingLoading } =
    useOnboardingPending();

  // Durable "already onboarded" flag (HOU-732). `isFirstRun` reads a zero-agent
  // workspace, which can't tell a fresh install from an emptied one — deleting
  // every agent, or finishing the migration wizard with zero cloud agents,
  // would wrongly re-enter onboarding. This flag is what distinguishes them:
  // set on every onboarding terminal path and on a "done" migration, and
  // backfilled here for existing active users. Its load joins the splash gate so
  // a returning agent-less user never flashes into onboarding during boot.
  const {
    isCompleted: onboardingCompleted,
    isLoading: onboardingCompletedLoading,
    markCompleted,
  } = useOnboardingCompleted();

  // Backfill: any existing user who already has agents predates the flag, so
  // stamp them completed once on boot. This upgrades-only (never clears), so a
  // fresh install with zero agents stays uncompleted and onboarding is
  // unchanged. Gated on the fetch having settled so we don't write redundantly,
  // and held while onboarding is in progress: the team card hires AI Employees
  // before the user finishes it, and only its finish completes onboarding.
  useEffect(() => {
    if (
      agentCount > 0 &&
      pendingStage === "none" &&
      !onboardingPendingLoading &&
      !onboardingCompletedLoading &&
      !onboardingCompleted
    ) {
      void markCompleted();
    }
  }, [
    agentCount,
    pendingStage,
    onboardingPendingLoading,
    onboardingCompletedLoading,
    onboardingCompleted,
    markCompleted,
  ]);

  return {
    pendingStage,
    onboardingPendingLoading,
    onboardingCompleted,
    onboardingCompletedLoading,
  };
}
