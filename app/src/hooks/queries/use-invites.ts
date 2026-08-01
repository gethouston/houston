import type { OrgSummary } from "@houston-ai/engine-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { showExpectedStateToast } from "../../lib/error-toast";
import {
  classifyInviteError,
  type InviteFailure,
  isExpectedInviteError,
  teamIsInSwitcher,
} from "../../lib/invite-model";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * The INVITEE side of C8 team invites: accept / decline a pending invite from
 * `GET /v1/orgs`'s `invites`. The owner's revoke is a different route and a
 * different hook (`useDeleteInvite`, `use-org.ts`).
 *
 * Both hooks invalidate the spaces list on BOTH paths, not just on success:
 * every expected rejection (`already_member`, `invite_not_found`) means the
 * server's truth already moved on, so the stale card must disappear either way.
 * The invalidation fires FIRST and is never awaited behind the workspace
 * reload, so the answered card leaves the sidebar immediately rather than
 * lingering for the length of a `GET /v1/workspaces`.
 *
 * Accepting also reloads the workspace store — a joined team reaches the
 * switcher through `GET /v1/workspaces`, which is Zustand, not a query the
 * invalidation could reach. That reload SWALLOWS its own failure (it only
 * records `loadError`), so the success toast checks `teamIsInSwitcher` against
 * the reloaded list before promising the team is there; when it isn't, the copy
 * says so instead. Nothing switches the active space: joining is not the same
 * as going there.
 *
 * Expected gateway states are silenced from `call()`'s red bug toast and get
 * ONE plain informational toast here instead (`invite-model.ts` holds the
 * taxonomy). Anything else keeps the standard toast + Sentry report.
 */

/** Copy for each expected rejection, keyed by `teams:inviteInbox.errors.*`. */
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
      // Prompt, un-awaited: the answered card must leave the sidebar now, not
      // after the workspace reload below.
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      await loadWorkspaces();
      // `loadWorkspaces` resolves even when it failed, so the list itself is
      // the only honest evidence that the team reached the switcher.
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
  return useMutation<void, unknown, string>({
    mutationFn: (inviteId: string) =>
      tauriOrg.declineInvite(inviteId, { silence: isExpectedInviteError }),
    onSuccess: () => {
      analytics.track("org_invite_declined");
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
    onError: (err) => {
      showInviteFailure(t, err);
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
    },
  });
}

/**
 * Surface an expected rejection as its own informational toast. `unknown`
 * failures already reached the user through `call()`'s red toast + Sentry
 * report, so they get nothing extra here (one surface per action).
 */
function showInviteFailure(t: TFunction<"teams">, err: unknown): void {
  const failure = classifyInviteError(err);
  if (failure === "unknown") return;
  const key = FAILURE_COPY[failure];
  showExpectedStateToast(
    t(`inviteInbox.errors.${key}Title`),
    t(`inviteInbox.errors.${key}Body`),
  );
}
