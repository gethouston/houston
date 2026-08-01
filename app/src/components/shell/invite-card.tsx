import { AsyncButton } from "@houston-ai/core";
import type { OrgInviteSummary } from "@houston-ai/engine-client";
import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useAcceptInvite,
  useDeclineInvite,
} from "../../hooks/queries/use-invites";
import {
  type InviteActionLock,
  inviterDisplayName,
} from "../../lib/invite-model";

/**
 * One pending team invitation, offered where the user picks a space: directly
 * under the workspace switcher, ALWAYS visible (never behind a hover or a menu
 * — the switcher's dropdown would hide the whole thing behind a click, and an
 * invitation nobody sees is an invitation nobody accepts).
 *
 * The inviter is named only when the gateway sends something human; today
 * `invitedBy` is the inviter's user id, which no invitee-side read can resolve
 * (they are not in that org yet), so the card names the TEAM instead of putting
 * a database id in front of the user — see `inviterDisplayName`.
 *
 * Both actions route through hooks that own the whole surfacing story (list
 * refresh, workspace reload, expected-state toasts), so the row here has no
 * `catch` of its own: the card disappears when the refreshed list drops the
 * invite.
 *
 * Accept and Decline EXCLUDE each other through the shared {@link
 * InviteActionLock}, claimed synchronously before either mutation starts.
 * `AsyncButton`'s own rage-click guard is per button and `busy` only lands on
 * the next commit, so without the lock an Accept immediately followed by a
 * Decline fired both calls and the loser toasted a confusing
 * `already_member` / `invite_not_found` at a user who did nothing wrong.
 */
export function InviteCard({
  invite,
  lock,
}: {
  invite: OrgInviteSummary;
  lock: InviteActionLock;
}) {
  const { t } = useTranslation("teams");
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();
  const inviter = inviterDisplayName(invite.invitedBy);
  const busy = accept.isPending || decline.isPending;

  /** Run one invite action under the lock; a second click is dropped. */
  const runExclusive = async (act: () => Promise<unknown>) => {
    if (!lock.claim(invite.id)) return;
    try {
      await act();
    } catch {
      // Already surfaced once: an expected gateway state by the hook's
      // informational toast, anything else by `call()`'s bug toast.
    } finally {
      lock.release(invite.id);
    }
  };

  return (
    <li className="ht-hairline rounded-xl bg-card p-3">
      <div className="flex items-start gap-2">
        <Mail
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-ink-muted"
        />
        {/* `min-w-0` + `break-words`: a team name is up to 200 gateway-allowed
            characters and can be one unbroken token, which would otherwise push
            the card past the rail's width. */}
        <div className="min-w-0 flex-1">
          {/* `line-clamp-3`: the gateway allows a 200-character team name, and
              one unbroken token of those wraps to a dozen lines that push
              Accept / Decline out of the bounded list — a lone invitation whose
              buttons are below the fold. Three lines keep the actions in view;
              the full name stays in the DOM for screen readers and `title`. */}
          <p
            className="line-clamp-3 text-sm text-ink text-balance break-words"
            title={invite.orgName}
          >
            {inviter
              ? t("inviteInbox.headlineFrom", {
                  name: inviter,
                  team: invite.orgName,
                })
              : t("inviteInbox.headline", { team: invite.orgName })}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted break-words">
            {t("inviteInbox.asRole", {
              role: t(`people.roles.${invite.role}`),
            })}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <AsyncButton
          size="sm"
          className="flex-1 rounded-full"
          disabled={busy}
          aria-label={t("inviteInbox.acceptLabel", { team: invite.orgName })}
          onClick={() => runExclusive(() => accept.mutateAsync(invite.id))}
        >
          {t("inviteInbox.accept")}
        </AsyncButton>
        <AsyncButton
          size="sm"
          variant="ghost"
          className="flex-1 rounded-full"
          disabled={busy}
          aria-label={t("inviteInbox.declineLabel", { team: invite.orgName })}
          onClick={() => runExclusive(() => decline.mutateAsync(invite.id))}
        >
          {t("inviteInbox.decline")}
        </AsyncButton>
      </div>
    </li>
  );
}
