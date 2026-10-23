import type { GrantableOrgRole, OrgInfo } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { optimisticWrite } from "../../lib/optimistic-write";
import {
  orgWithMemberRole,
  orgWithoutInvite,
  orgWithoutMember,
} from "../../lib/org-cache-patches";
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
 * Adding a member waits for the host (it may mint an invite instead) and
 * carries no `onError`: `tauriOrg.addMember` routes through `call()`, which
 * surfaces + reports the failure once (the "user already in another org" 409
 * included). Adding an `onError` here would double-toast.
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
      role: GrantableOrgRole;
      options?: EngineCallOptions;
    }) => tauriOrg.addMember(email, role, options),
    onSuccess: (_data, { role }) => {
      analytics.track("org_member_added", { role });
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}

/**
 * The roster writes below paint `GET /org` (roster + pending invites) on the
 * click and send in the background (`optimisticWrite`). The People
 * screen only offers them to a caller who may make them (`canManage`), so the
 * expected refusal left is the `last_owner` 409, which `call()` explains with
 * its own toast while the rollback restores the row.
 */
function useOrgWrite() {
  const qc = useQueryClient();
  const { t } = useTranslation("teams");
  return useCallback(
    (opts: {
      command: string;
      copy: "removeMember" | "memberRole" | "revokeInvite";
      apply: (org: OrgInfo | undefined) => OrgInfo | undefined;
      write: () => Promise<unknown>;
      onSuccess: () => void;
    }) =>
      void optimisticWrite({
        qc,
        command: opts.command,
        patches: [{ queryKey: queryKeys.org(), apply: opts.apply }],
        write: opts.write,
        failure: {
          title: t(`writeFailed.${opts.copy}.title`),
          description: t(`writeFailed.${opts.copy}.description`),
        },
        onSuccess: opts.onSuccess,
      }),
    [qc, t],
  );
}

/** Revoke a pending invite (owner only). */
export function useDeleteInvite() {
  const write = useOrgWrite();
  return useCallback(
    (inviteId: string) =>
      write({
        command: "delete_org_invite",
        copy: "revokeInvite",
        apply: (org) => orgWithoutInvite(org, inviteId),
        write: () => tauriOrg.deleteInvite(inviteId),
        onSuccess: () => analytics.track("org_invite_revoked"),
      }),
    [write],
  );
}

export function useRemoveMember() {
  const write = useOrgWrite();
  return useCallback(
    (userId: string) =>
      write({
        command: "remove_org_member",
        copy: "removeMember",
        apply: (org) => orgWithoutMember(org, userId),
        write: () => tauriOrg.removeMember(userId),
        onSuccess: () => analytics.track("org_member_removed"),
      }),
    [write],
  );
}

export function useSetMemberRole() {
  const write = useOrgWrite();
  return useCallback(
    (userId: string, role: GrantableOrgRole) =>
      write({
        command: "set_org_member_role",
        copy: "memberRole",
        apply: (org) => orgWithMemberRole(org, userId, role),
        write: () => tauriOrg.setMemberRole(userId, role),
        onSuccess: () => analytics.track("org_role_changed", { role }),
      }),
    [write],
  );
}
