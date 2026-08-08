import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type AccountFlagRead,
  resolveOnboardingCompleted,
} from "../lib/onboarding-completed-policy";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences } from "../lib/tauri";
import { useSession } from "./use-session";

/**
 * Preference key for the durable "this user has finished first-run onboarding"
 * flag. An ACCOUNT preference (PRODUCT-1282): it rides `/v1/preferences/:key`
 * on the host/gateway like `legal_acceptance`, so it survives sign-out — which
 * purges every account-scoped localStorage key — and follows the account to
 * new devices. A device-local copy died with the session, and the next
 * sign-in re-onboarded a returning user whose agent list read empty for a
 * moment (warming pod).
 */
export const ONBOARDING_COMPLETED_KEY = "onboarding_completed";

/** Per-user localStorage key for the device-local mirror of the flag (mirrors
 *  `onboardingSegmentLocalKey`). */
function onboardingCompletedLocalKey(uid: string | null): string {
  return `houston.onboarding-completed.${uid ?? "local"}`;
}

// Device-local mirror of the completed flag (per signed-in uid). The account
// preference lives behind the host/gateway, so an unreachable host or a failed
// write would resolve `isCompleted=false` and re-onboard a real user (zero
// cloud agents after a migration / delete-all). The mirror keeps the flag
// reading completed per user per device even when the account pref is
// unreachable. Sign-out purges it — the account pref is the durable copy.
// localStorage failures are non-fatal (behaves as before).
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
  } catch {
    /* quota / disabled storage — the engine pref still carries the flag */
  }
}

export interface OnboardingCompletedState {
  /** True once first-run onboarding has been finished, the migration wizard
   *  completed a "done" outcome, or an existing active user was backfilled.
   *  While true, a zero-agent workspace reads as an emptied workspace, not a
   *  fresh install, so App.tsx keeps the user in the shell instead of routing
   *  back into onboarding. */
  isCompleted: boolean;
  /** True while the initial preference fetch is in flight. Gate the first-run
   *  decision on this so a returning, agent-less user never flashes into
   *  onboarding during boot. */
  isLoading: boolean;
  /** Persist the completed flag. Idempotent, and only ever upgrades (there is
   *  no un-complete): called from every onboarding terminal path, the
   *  migration "done" outcome, and the existing-user backfill. */
  markCompleted: () => Promise<void>;
}

/**
 * Durable record that first-run onboarding is behind this account.
 *
 * `isFirstRun` (App.tsx) reports first-run from a ZERO-AGENT workspace on the v3
 * control plane. That signal cannot tell "never onboarded" apart from "onboarded
 * then deleted every agent" — so without this flag, finishing the migration
 * wizard or deleting all agents would wrongly drop the user back into onboarding.
 * This flag is the persisted "already onboarded" bit: set on every onboarding
 * terminal path, when the migration wizard persists a "done" outcome, and
 * backfilled for existing active users (agents present) on boot. Absent flag on
 * a genuinely fresh install reads as not-completed, so first-run is unchanged.
 *
 * Hardened like `useOnboardingSegment`: keyed by uid (no stale value across a
 * user switch) with a uid-keyed localStorage mirror, so a failed or unreachable
 * account pref read never DOWNGRADES a completed user back into onboarding.
 * The merge itself is `resolveOnboardingCompleted` (pure, unit-tested).
 */
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
      } catch {
        // Host unreachable (waking / offline) — fall through to the local
        // mirror rather than re-onboarding a completed user.
      }
      const resolved = resolveOnboardingCompleted(
        account,
        readLocalMirror(uid),
      );
      if (resolved.refreshMirror) writeLocalMirror(uid);
      if (resolved.healAccount) {
        // The mirror says completed but the account pref is missing (pre-fix
        // device-local completion, or a lost write): stamp it back up so the
        // flag survives the NEXT sign-out too. Best-effort, off the boot path.
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
      // The local mirror is written FIRST: once completed, this device must
      // never re-onboard the user even if the account write fails.
      writeLocalMirror(uid);
      try {
        await tauriPreferences.set(ONBOARDING_COMPLETED_KEY, "1");
      } catch (e) {
        // Best-effort: the flag is kept locally; the next boot's queryFn heals
        // the account pref from the mirror. Logged, never blocks the flow.
        console.error("[onboarding-completed] account pref write failed", e);
      }
    },
    onSuccess: () => {
      qc.setQueryData<boolean>(queryKeys.onboardingCompleted(uid), true);
    },
  });

  // Stable across renders (react-query memoizes `mutateAsync`), so the consumer
  // can safely list `markCompleted` in an effect's deps without the effect
  // re-firing on mutation status churn. Flips the query cache SYNCHRONOUSLY
  // before the persisted write so the same-tick re-render already reads
  // completed — the backfill effect never fires twice and no onboarding frame
  // slips through.
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
