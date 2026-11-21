import type { OrgSummary, OrgsList } from "@houston/engine-adapter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import {
  classifyInviteError,
  type InviteFailure,
  isExpectedInviteError,
  teamIsInSwitcher,
} from "../../lib/invite-model";
import { runOptimisticWrite } from "../../lib/optimistic-core";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import { orgsWithoutInvite } from "../../lib/org-cache-patches";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

const FAILURE_COPY = {
  needs_upgrade: "needsUpgrade",
  already_member: "alreadyMember",
  invite_not_found: "gone",
} as const satisfies Record<Exclude<InviteFailure, "unknown">, string>;

export function useAcceptInvite() {
  const { t } = useTranslation("teams");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  return useMutation<OrgSummary, unknown, string>({
    mutationFn: (inviteId: string) =>
      tauriOrg.acceptInvite(inviteId, { silence: isExpectedInviteError }),
    onSuccess: async (org) => {
      analytics.track("org_invite_accepted");
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      await loadWorkspaces();
      const inSwitcher = teamIsInSwitcher(
        useWorkspaceStore.getState().workspaces,
        org.slug,
      );
      addToast({
        title: t("inviteInbox.joinedTitle", { team: org.name }),
        description: inSwitcher
          ? t("inviteInbox.joinedBody")
          : t("inviteInbox.joinedBodyUnconfirmed"),
        variant: "success",
      });
    },
    onError: (err) => {
      showInviteFailure(t, err);
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

export function useDeclineInvite() {
  const { t } = useTranslation("teams");
  const qc = useQueryClient();
  return useCallback(
    (inviteId: string) =>
      runOptimisticWrite(
        {
          qc,
          command: "decline_org_invite",
          patches: [
            {
              queryKey: queryKeys.orgs(),
              apply: (list: OrgsList | undefined) =>
                orgsWithoutInvite(list, inviteId),
            },
          ],
          write: () =>
            tauriOrg.declineInvite(inviteId, {
              silence: isExpectedInviteError,
            }),
          failure: {
            title: t("writeFailed.declineInvite.title"),
            description: t("writeFailed.declineInvite.description"),
          },
          onSuccess: () => analytics.track("org_invite_declined"),
        },
        (command, err, copy) =>
          isExpectedInviteError(err)
            ? showInviteFailure(t, err)
            : tellOptimisticRefusal(command, err, copy),
        logAndReportError,
      ),
    [qc, t],
  );
}

function showInviteFailure(t: TFunction<"teams">, err: unknown): void {
  const failure = classifyInviteError(err);
  if (failure === "unknown") return;
  if (failure === "needs_upgrade" && !canPurchaseInApp()) {
    showExpectedStateToast(
      t("native.inviteNeedsUpgradeTitle"),
      t("native.inviteNeedsUpgradeBody"),
    );
    return;
  }
  const key = FAILURE_COPY[failure];
  showExpectedStateToast(
    t(`inviteInbox.errors.${key}Title`),
    t(`inviteInbox.errors.${key}Body`),
  );
}
