import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type AccountFlagRead,
  resolveOnboardingCompleted,
} from "../lib/onboarding-completed-policy";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences } from "../lib/tauri";
import { useSession } from "./use-session";

export const ONBOARDING_COMPLETED_KEY = "onboarding_completed";

function onboardingCompletedLocalKey(uid: string | null): string {
  return `houston.onboarding-completed.${uid ?? "local"}`;
}

function readLocalMirror(uid: string | null): boolean {
  try {
    return localStorage.getItem(onboardingCompletedLocalKey(uid)) === "1";
  } catch {
    return false;
  }
}

function writeLocalMirror(uid: string | null): void {
  try {
    localStorage.setItem(onboardingCompletedLocalKey(uid), "1");
  } catch {}
}

export interface OnboardingCompletedState {
  isCompleted: boolean;
  isLoading: boolean;
  markCompleted: () => Promise<void>;
}

export function useOnboardingCompleted(): OnboardingCompletedState {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const uid = session?.uid ?? null;

  const query = useQuery({
    queryKey: queryKeys.onboardingCompleted(uid),
    queryFn: async (): Promise<boolean> => {
      let account: AccountFlagRead = "unreachable";
      try {
        const raw = await tauriPreferences.get(ONBOARDING_COMPLETED_KEY);
        account = raw?.trim() === "1" ? "completed" : "unset";
      } catch {}
      const resolved = resolveOnboardingCompleted(
        account,
        readLocalMirror(uid),
      );
      if (resolved.refreshMirror) writeLocalMirror(uid);
      if (resolved.healAccount) {
        tauriPreferences.set(ONBOARDING_COMPLETED_KEY, "1").catch((e) => {
          console.error("[onboarding-completed] account pref heal failed", e);
        });
      }
      return resolved.completed;
    },
    staleTime: 30_000,
  });

  const { mutateAsync } = useMutation({
    mutationFn: async () => {
      writeLocalMirror(uid);
      try {
        await tauriPreferences.set(ONBOARDING_COMPLETED_KEY, "1");
      } catch (e) {
        console.error("[onboarding-completed] account pref write failed", e);
      }
    },
    onSuccess: () => {
      qc.setQueryData<boolean>(queryKeys.onboardingCompleted(uid), true);
    },
  });

  const markCompleted = useCallback(async () => {
    qc.setQueryData<boolean>(queryKeys.onboardingCompleted(uid), true);
    await mutateAsync();
  }, [mutateAsync, qc, uid]);

  return {
    isCompleted: query.data === true,
    isLoading: query.isLoading,
    markCompleted,
  };
}
