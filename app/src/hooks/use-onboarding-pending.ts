import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { tauriPreferences } from "../lib/tauri";

/**
 * Engine-preference key for the "first-run onboarding is mid-flight" flag.
 * Stored as an opaque string in `~/.houston` prefs (same mechanism as
 * `legal_acceptance`), so it survives an app restart.
 */
export const ONBOARDING_PENDING_KEY = "onboarding_pending";

const queryKey = ["onboarding-pending"] as const;

export interface OnboardingPendingState {
  /** True while the flow is mid-flight (set on mount, cleared on any terminal
   *  path). App.tsx re-enters onboarding while this is true even though the
   *  assistant already exists. */
  isPending: boolean;
  /** True while the initial preference fetch is in flight. Gate the first-run
   *  decision on this so returning users never flash into onboarding. */
  isLoading: boolean;
  /** Persist the pending flag. Called when the orchestrator mounts. */
  markPending: () => Promise<void>;
  /** Clear the pending flag. Called in every terminal path (finish / skip). */
  clearPending: () => Promise<void>;
}

/**
 * Drives the resume contract for interrupted first-run onboarding.
 *
 * The assistant is provisioned SILENTLY the instant the AI connects, so once
 * that happens the agent-count first-run signal (`isFirstRun`) reports `false`
 * forever — quitting mid-flow would permanently skip the rest of setup. This
 * durable flag closes that gap: the orchestrator sets it on mount and clears it
 * on finish or skip, and App.tsx shows onboarding while it's set. Absent flag
 * (every existing, fully-onboarded user) reads as not-pending, so their
 * behavior is unchanged.
 *
 * Re-entry is safe by construction: the flow re-enters at `intro`, creation is
 * idempotent (`ensureWorkspaceWithAssistant` reuses the existing workspace +
 * agent), the connect step auto-advances for an already-connected provider, and
 * the connectEmail step hands off on re-picking a connected toolkit.
 */
export function useOnboardingPending(): OnboardingPendingState {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<boolean> => {
      const raw = await tauriPreferences.get(ONBOARDING_PENDING_KEY);
      return raw?.trim() === "1";
    },
    staleTime: 30_000,
  });

  const { mutateAsync } = useMutation({
    mutationFn: async (pending: boolean) => {
      await tauriPreferences.set(ONBOARDING_PENDING_KEY, pending ? "1" : "");
      return pending;
    },
    onSuccess: (pending) => {
      qc.setQueryData<boolean>(queryKey, pending);
    },
  });

  // Stable across renders (react-query memoizes `mutateAsync`), so the consumer
  // can safely list `markPending` in an on-mount effect's deps without the
  // effect re-firing on mutation status churn.
  const markPending = useCallback(async () => {
    await mutateAsync(true);
  }, [mutateAsync]);

  const clearPending = useCallback(async () => {
    await mutateAsync(false);
  }, [mutateAsync]);

  return {
    isPending: query.data === true,
    isLoading: query.isLoading,
    markPending,
    clearPending,
  };
}
