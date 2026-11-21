import { useManagerOnboarding } from "../components/assistant/onboarding/manager-onboarding-context";
import { managerReachable } from "../lib/manager-reachable";
import { useSurfaceGates } from "./use-surface-gates";

export function useManagerReachable(): boolean {
  const { showAssistant } = useSurfaceGates();
  const onboarding = useManagerOnboarding();
  return managerReachable({
    showAssistant,
    onboardingActive: onboarding !== null,
  });
}
