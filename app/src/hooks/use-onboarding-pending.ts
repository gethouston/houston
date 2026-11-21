import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type OnboardingPendingStage,
  onboardingPendingValue,
  parseOnboardingPending,
} from "../lib/onboarding-pending";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences } from "../lib/tauri";

export const ONBOARDING_PENDING_KEY = "onboarding_pending";

const queryKey = queryKeys.onboardingPending();

export interface OnboardingPendingState {
  stage: OnboardingPendingStage;
  isLoading: boolean;
  markPending: (
    stage: Exclude<OnboardingPendingStage, "none">,
  ) => Promise<void>;
  clearPending: () => Promise<void>;
}

export function useOnboardingPending(): OnboardingPendingState {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<OnboardingPendingStage> =>
      parseOnboardingPending(
        await tauriPreferences.get(ONBOARDING_PENDING_KEY),
      ),
    staleTime: 30_000,
  });

  const { mutateAsync } = useMutation({
    scope: { id: ONBOARDING_PENDING_KEY },
    mutationFn: (stage: OnboardingPendingStage) =>
      tauriPreferences.set(
        ONBOARDING_PENDING_KEY,
        onboardingPendingValue(stage),
      ),
  });

  const record = useCallback(
    async (stage: OnboardingPendingStage) => {
      qc.setQueryData<OnboardingPendingStage>(queryKey, stage);
      await mutateAsync(stage);
    },
    [mutateAsync, qc],
  );
  const markPending = useCallback(
    (stage: Exclude<OnboardingPendingStage, "none">) => record(stage),
    [record],
  );
  const clearPending = useCallback(() => record("none"), [record]);

  return {
    stage: query.data ?? "none",
    isLoading: query.isLoading,
    markPending,
    clearPending,
  };
}
