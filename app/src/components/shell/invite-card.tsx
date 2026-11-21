import type { OrgInviteSummary } from "@houston/engine-adapter";
import { AsyncButton } from "@houston-ai/core";
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
  const busy = accept.isPending;

  const runExclusive = async (act: () => Promise<unknown>) => {
    if (!lock.claim(invite.id)) return;
    try {
      await act();
    } catch {
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
        <div className="min-w-0 flex-1">
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
          onClick={() => runExclusive(() => decline(invite.id))}
        >
          {t("inviteInbox.decline")}
        </AsyncButton>
      </div>
    </li>
  );
}
