import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentTeamErrorCopy,
  isExpectedAgentTeamError,
} from "../../lib/agent-team-errors";
import { showExpectedStateToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { queryKeys } from "../../lib/query-keys";

/**
 * The shared plumbing every C13 agent-teams WRITE goes through (the hooks
 * themselves are in `use-agent-teams.ts`). It lives in one module precisely so
 * no mutation can drift from the two rules that bind all of them: silence the
 * expected gateway states, and surface them once, in the user's own words.
 */

/** Passed to EVERY agent-teams mutation, so `call()` never fires its red
 *  report-a-bug pair for a state {@link surfaceExpectedAgentTeamError}
 *  explains. ONE constant, so no mutation can end up wired half-way. */
export const SILENCE_EXPECTED = { silence: isExpectedAgentTeamError } as const;

/**
 * The ONE expected-error surface for every agent-teams write: an expected
 * rejection becomes an informational toast in the user's own words, anything
 * else falls through to `call()`'s report-a-bug path. Exactly one surface per
 * action, either way. Deliberately NOT a branch in `surfaceError`
 * (`lib/tauri.ts`): `personal_space` already means the invite flow there, where
 * C13's means "this space has no people to manage", and the error alone cannot
 * tell the two apart, only the call site can.
 */
export function surfaceExpectedAgentTeamError(err: unknown): void {
  const copy = agentTeamErrorCopy(err);
  if (!copy) return;
  // The copy map is pure and i18n-free, so its keys arrive as plain strings;
  // they are the `teams:agentTeams.errors.*` family, present in every locale.
  const t = i18n.t as (key: string) => string;
  showExpectedStateToast(t(copy.titleKey), t(copy.bodyKey));
}

/** A write naming one person in one team. */
export interface TeamMemberVars {
  teamId: string;
  userId: string;
}

/**
 * Every non-optimistic agent-teams write, wired identically: the shared
 * expected-error surface plus the invalidations. They run on SETTLED because a
 * rejection is often the cache being stale (a team someone else deleted, a
 * membership that changed under us), so the failure path is where a re-read is
 * worth most.
 */
export function useAgentTeamWrite<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  /** The team whose member rows this write also changes, when it changes any. */
  membersOf?: (vars: TVars) => string,
) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn,
    onError: surfaceExpectedAgentTeamError,
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentTeams() });
      if (membersOf) {
        qc.invalidateQueries({
          queryKey: queryKeys.agentTeamMembers(membersOf(vars)),
        });
      }
    },
  });
}

/**
 * Every OPTIMISTIC agent-teams write, wired identically: patch the cached teams
 * before the round trip, restore the snapshot on a refusal, re-read on settle.
 *
 * The three writes that need it — the cross-team drop, the identity picker, the
 * shared-context editor — all act on a surface that has ALREADY moved by the
 * time the request leaves (the agent animated into its new block, the rail
 * repainted, the textarea holds what the user typed). Without the patch each of
 * them snaps back to server truth for the length of the request. The rollback
 * IS the error surface: the old value visibly returns and the expected-state
 * toast says why.
 *
 * `patch` receives the cached list and the write's own vars, and answers the
 * list the cache should hold; nothing cached means nothing patched, so there is
 * nothing to restore either.
 */
export function useOptimisticAgentTeamWrite<TVars, TData, TCached>(
  key: readonly unknown[],
  mutationFn: (vars: TVars) => Promise<TData>,
  patch: (cached: TCached, vars: TVars) => TCached,
) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars, { prev: TCached | undefined }>({
    mutationFn,
    onMutate: async (vars) => {
      // Cancel first: a read landing after the patch would overwrite it.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TCached>(key);
      if (prev) qc.setQueryData(key, patch(prev, vars));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      surfaceExpectedAgentTeamError(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
