import { AsyncButton, Avatar, AvatarFallback } from "@houston-ai/core";
import type { OrgInvite, OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { useDeleteInvite } from "../../hooks/queries";
import { initialsFor, inviterLabel } from "./people-tab-model";

/**
 * Pending invitations on the People tab: people invited by email who haven't
 * signed in yet (the invite is consumed on their first sign-in). Owners can
 * revoke; admins see the list read-only. Revoke failures surface as a toast from
 * the `call()` wrapper, so no `onError` here. Invites ride on `GET /org`, so a
 * successful revoke re-fetches the org and the row disappears.
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
      <h2 className="mb-2 text-sm font-medium text-foreground">
        {t("people.invites.title")}
      </h2>
      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("people.invites.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center gap-3 rounded-xl border border-foreground/5 bg-card px-4 py-3"
            >
              <Avatar>
                <AvatarFallback className="text-xs">
                  {initialsFor(invite.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {invite.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t("people.invites.invitedBy", {
                    name: inviterLabel(invite.invitedBy, members),
                  })}
                </div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {t(`people.roles.${invite.role}`)}
              </span>
              {canManage && (
                <AsyncButton
                  variant="ghost"
                  className="rounded-full text-destructive hover:text-destructive"
                  aria-label={t("people.invites.revokeLabel", {
                    email: invite.email,
                  })}
                  onClick={async () => {
                    try {
                      await deleteInvite.mutateAsync(invite.id);
                    } catch {
                      // call() already toasted + reported the failure.
                    }
                  }}
                >
                  {t("people.invites.revoke")}
                </AsyncButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
