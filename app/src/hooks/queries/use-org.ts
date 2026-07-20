import type { OrgRole } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analytics } from "../../lib/analytics";
import { queryKeys } from "../../lib/query-keys";
import { type EngineCallOptions, tauriOrg } from "../../lib/tauri";

/**
 * The current user's org (identity + role, plus the roster for owner/admin).
 * Multiplayer-only: on a single-player/desktop host `getOrg()` throws, so the
 * query stays disabled unless the caller passes `enabled` (the Members surface
 * gates on `capabilities.multiplayer`). One org per user, so it's app-scoped.
 */
export function useOrg(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.org(),
    queryFn: () => tauriOrg.get(),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * The mutations below carry no `onError`: their `mutationFn` routes through the
 * `tauriOrg.*` wrappers, each wrapped by the `call()` adapter in `lib/tauri.ts`.
 * `call()` already surfaces the real error as a red toast AND
 * reports it to Sentry before re-throwing (React Query swallows the re-throw
 * internally, so `.mutate()` never leaks). The "last owner" 409 and "user
 * already in another org" 409 from the gateway reach the user through that same
 * path. Adding an `onError` here would double-toast.
 */
export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    // `options` lets a specific caller override `call()`'s surfacing (e.g. the
    // share-via-team flow silences the expected `already_member` state, which it
    // renders inline). Omitting it keeps the default red toast + Sentry report,
    // which is the ONLY failure surface for the org-dashboard invite forms.
    mutationFn: ({
      email,
      role,
      options,
    }: {
      email: string;
      role: OrgRole;
      options?: EngineCallOptions;
    }) => tauriOrg.addMember(email, role, options),
    onSuccess: (_data, { role }) => {
      analytics.track("org_member_added", { role });
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}

/**
 * Revoke a pending invite (owner only). Invites ride on `OrgInfo` (`GET /org`),
 * so re-fetching the org after a successful revoke is the reactive path — the
 * roster + invites re-render together. Carries no `onError`: `tauriOrg.deleteInvite`
 * routes through `call()`, which already toasts + reports the failure once.
 */
export function useDeleteInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => tauriOrg.deleteInvite(inviteId),
    onSuccess: () => {
      analytics.track("org_invite_revoked");
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => tauriOrg.removeMember(userId),
    onSuccess: () => {
      analytics.track("org_member_removed");
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      tauriOrg.setMemberRole(userId, role),
    onSuccess: (_data, { role }) => {
      analytics.track("org_role_changed", { role });
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}
