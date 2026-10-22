import type { OrgInvite, OrgMember } from "@houston/engine-adapter";
import { Avatar, AvatarFallback, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useDeleteInvite } from "../../hooks/queries";
import { memberLabel } from "./org-roster";
import { initialsFor } from "./people-tab-model";

/**
 * Pending invitations on the People tab: people invited by email who haven't
 * signed in yet (the invite is consumed on their first sign-in). Owners can
 * revoke; admins see the list read-only. A revoke is optimistic: the row leaves
 * on the click, and comes back with a toast if the host refuses.
 */
export function PendingInvites({
  invites,
  members,
  canManage,
}: {
  invites: OrgInvite[];
  members: OrgMember[];
  canManage: boolean;
}) {
  const { t } = useTranslation("teams");
  const deleteInvite = useDeleteInvite();

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink">
        {t("people.invites.title")}
      </h2>
      {invites.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("people.invites.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center gap-3 rounded-xl border border-ink/5 bg-card px-4 py-3"
            >
              <Avatar>
                <AvatarFallback className="text-xs">
                  {initialsFor(invite.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {invite.email}
                </div>
                <div className="truncate text-xs text-ink-muted">
                  {t("people.invites.invitedBy", {
                    name: memberLabel(invite.invitedBy, members, {
                      unnamedAccount: t("people.roster.unnamedAccount"),
                      formerMember: t("people.roster.formerMember"),
                    }),
                  })}
                </div>
              </div>
              <span className="rounded-full bg-chip px-3 py-1 text-xs text-ink-muted">
                {t(`people.roles.${invite.role}`)}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  className="rounded-full text-danger hover:text-danger"
                  aria-label={t("people.invites.revokeLabel", {
                    email: invite.email,
                  })}
                  onClick={() => deleteInvite(invite.id)}
                >
                  {t("people.invites.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
