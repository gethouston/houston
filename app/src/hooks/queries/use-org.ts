import type { OrgInfo, OrgRole } from "@houston/engine-adapter";
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

export function useOrg(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.org(),
    queryFn: () => tauriOrg.get(),
    enabled,
    staleTime: 30_000,
  });
}

export function useSeatQuote(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.seatQuote(),
    queryFn: () => tauriOrg.quoteSeat(),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      role,
      options,
      charge,
    }: {
      email: string;
      role: OrgRole;
      options?: EngineCallOptions;
      charge?: { prorationDate: number; quotedAmountCents: number };
    }) => tauriOrg.addMember(email, role, options, charge),
    onSuccess: (outcome, { role }) => {
      if (outcome.kind === "quote_changed") {
        qc.setQueryData(queryKeys.seatQuote(), outcome.quote);
        return;
      }
      if (outcome.kind === "added") {
        analytics.track("org_member_added", { role });
        qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      }
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}

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

function useRefreshSeats() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    qc.invalidateQueries({ queryKey: queryKeys.seatQuote() });
  }, [qc]);
}

export function useDeleteInvite() {
  const write = useOrgWrite();
  const refreshSeats = useRefreshSeats();
  return useCallback(
    (inviteId: string) =>
      write({
        command: "delete_org_invite",
        copy: "revokeInvite",
        apply: (org) => orgWithoutInvite(org, inviteId),
        write: () => tauriOrg.deleteInvite(inviteId),
        onSuccess: () => {
          analytics.track("org_invite_revoked");
          refreshSeats();
        },
      }),
    [write, refreshSeats],
  );
}

export function useRemoveMember() {
  const write = useOrgWrite();
  const refreshSeats = useRefreshSeats();
  return useCallback(
    (userId: string) =>
      write({
        command: "remove_org_member",
        copy: "removeMember",
        apply: (org) => orgWithoutMember(org, userId),
        write: () => tauriOrg.removeMember(userId),
        onSuccess: () => {
          analytics.track("org_member_removed");
          refreshSeats();
        },
      }),
    [write, refreshSeats],
  );
}

export function useSetMemberRole() {
  const write = useOrgWrite();
  return useCallback(
    (userId: string, role: OrgRole) =>
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
