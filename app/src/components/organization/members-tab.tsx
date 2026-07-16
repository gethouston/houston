import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/use-session";
import type { OrgTabProps } from "./organization-view";
import { PeopleAddRow } from "./people-add-row";
import { PendingInvites } from "./people-invites";
import { PeopleRoster } from "./people-roster";

/**
 * The Organization > People tab: add/invite people, review pending invitations,
 * and manage the roster. Owners do everything; admins (Managers) see the
 * add/re-role controls read-only per the role matrix v2, but EVERY viewer can
 * click a roster row to drill into that person's per-agent access lens
 * (`onOpenMember` → the member detail screen; the gateway clamps what a
 * non-owner may change). The shell already gates this view to multiplayer
 * owner/admin, so it never mounts in single-player or for a plain member. All
 * mutations route through hooks whose `call()` wrapper toasts on failure, so
 * there are no silent failures here.
 */
export default function MembersTab({
  ctx,
  onOpenMember,
}: OrgTabProps & { onOpenMember: (member: OrgMember) => void }) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const canManage = ctx.isOwner;
  const members = ctx.org.members ?? [];
  const invites = ctx.org.invites ?? [];

  return (
    <div className="flex flex-col gap-8 py-6">
      {canManage ? (
        <PeopleAddRow />
      ) : (
        <p className="text-sm text-ink-muted">{t("people.adminNotice")}</p>
      )}
      <PendingInvites
        invites={invites}
        members={members}
        canManage={canManage}
      />
      <PeopleRoster
        members={members}
        selfId={selfId}
        canManage={canManage}
        onOpenMember={onOpenMember}
      />
    </div>
  );
}
