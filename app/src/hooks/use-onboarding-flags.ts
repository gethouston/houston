import { useEffect } from "react";
import { useOnboardingCompleted } from "./use-onboarding-completed";
import { useOnboardingPending } from "./use-onboarding-pending";

export function useOnboardingFlags(agentCount: number) {
  const { stage: pendingStage, isLoading: onboardingPendingLoading } =
    useOnboardingPending();

  const {
    isCompleted: onboardingCompleted,
    isLoading: onboardingCompletedLoading,
    markCompleted,
  } = useOnboardingCompleted();

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
