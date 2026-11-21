import { createContext, type ReactNode, useContext } from "react";
import type { OnboardingSurveyState } from "../../../hooks/use-onboarding-survey";
import type { FirstRunStage } from "../../../lib/manager-onboarding/script";

export type ManagerOnboardingState =
  | {
      mode: "first_run";
      stage: FirstRunStage;
      survey: OnboardingSurveyState;
      onSurveyDone: () => void;
      finish: () => void;
    }
  | {
      mode: "profile_completion";
      survey: OnboardingSurveyState;
      close: () => void;
    };

const Context = createContext<ManagerOnboardingState | null>(null);

export function ManagerOnboardingProvider({
  value,
  children,
}: {
  value: ManagerOnboardingState | null;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useManagerOnboarding(): ManagerOnboardingState | null {
  return useContext(Context);
}
