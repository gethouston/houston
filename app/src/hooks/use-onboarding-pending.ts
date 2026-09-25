import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type OnboardingPendingStage,
  onboardingPendingValue,
  parseOnboardingPending,
} from "../lib/onboarding-pending";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences } from "../lib/tauri";

/**
 * Engine-preference key for how far a mid-flight first-run onboarding got.
 * Stored as an opaque string in `~/.houston` prefs (same mechanism as
 * `legal_acceptance`), so it survives an app restart.
 */
export const ONBOARDING_PENDING_KEY = "onboarding_pending";

const queryKey = queryKeys.onboardingPending();

export interface OnboardingPendingState {
  /** How far the first run in flight got; `"none"` when none is (see
   *  `lib/onboarding-pending.ts`). */
  stage: OnboardingPendingStage;
  /** True while the initial preference fetch is in flight. Gate the first-run
   *  decision on this so returning users never flash into onboarding. */
  isLoading: boolean;
  /** Persist the stage the run reached: `"started"` when it mounts, `"team"`
   *  once the team card is on screen. */
  markPending: (
    stage: Exclude<OnboardingPendingStage, "none">,
  ) => Promise<void>;
  /** Clear the pending stage. Called when the team card finishes. */
  clearPending: () => Promise<void>;
}

/**
 * Drives the resume contract for interrupted first-run onboarding.
 *
 * The team card hires AI Employees before the user finishes it, so once the
 * first one exists the agent-count first-run signal (`isFirstRun`) reports
 * `false` forever: quitting mid-flow would permanently skip the rest of setup.
 * This durable stage closes that gap: the first-run onboarding records it
 * (`use-first-run-onboarding.ts`) and its finish clears it, and App routes
 * into onboarding while one is set. An absent or unknown value (every
 * existing, fully-onboarded user) reads as `"none"`.
 *
 * A resumed run's route is derived from what is already done (survey
 * answered, AI connected, team card reached), so it lands on the first screen
 * still owed rather than asking for that work twice.
 */
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

  // One scope: the writes land in the order they were made, so a run that
  // starts straight on the team card never has "started" overwrite "team".
  const { mutateAsync } = useMutation({
    scope: { id: ONBOARDING_PENDING_KEY },
    mutationFn: (stage: OnboardingPendingStage) =>
      tauriPreferences.set(
        ONBOARDING_PENDING_KEY,
        onboardingPendingValue(stage),
      ),
  });

  // Stable across renders (react-query memoizes `mutateAsync`), so the consumer
  // can safely list these in an effect's deps without it re-firing on
  // mutation status churn.
  //
  // Each writer flips the query cache SYNCHRONOUSLY, before the persisted
  // write, and the cache is never written again when it lands: the team card's
  // finish must route into the app in the same render, and a late answer from
  // an earlier write must never put back a stage the run has left. The write
  // itself is what the next boot reads.
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
