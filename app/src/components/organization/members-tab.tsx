import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/use-session";
import { OrgLockedFieldset } from "../shell/org-locked-fieldset";
import { CreateOrganizationInviteEmpty } from "./create-organization-invite-empty";
import type { OrgTabProps } from "./organization-view";
import { PeopleAddRow } from "./people-add-row";
import { PendingInvites } from "./people-invites";
import { PeopleRoster } from "./people-roster";

export default function MembersTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const canManage = ctx.isOwner;
  const members = ctx.org.members ?? [];
  const invites = ctx.org.invites ?? [];

  if (ctx.isPersonal) return <CreateOrganizationInviteEmpty />;

  return (
    <div className="flex flex-col gap-8 py-6">
      {canManage ? (
        <OrgLockedFieldset>
          <PeopleAddRow />
        </OrgLockedFieldset>
      ) : (
        <p className="text-sm text-ink-muted">{t("people.adminNotice")}</p>
      )}
      <PendingInvites
        invites={invites}
        members={members}
        canManage={canManage}
      />
      <PeopleRoster members={members} selfId={selfId} canManage={canManage} />
    </div>
  );
}
