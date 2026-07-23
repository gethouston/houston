import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { isPersonalSpace } from "../../lib/org-roles";
import type { OrgTabProps } from "./organization-view";
import { PeopleAddRow } from "./people-add-row";
import { PeopleCreateTeamCta } from "./people-create-team-cta";
import { PendingInvites } from "./people-invites";
import { PeopleRoster } from "./people-roster";

/**
 * The Organization > People tab: add/invite people, review pending invitations,
 * and manage the roster (membership only). Owners do everything; admins
 * (Managers) see the add/re-role controls read-only per the role matrix v2. WHO
 * can use which agent is the Permissions view's job now — a roster row is no
 * longer a drill-in. The shell already gates this view to multiplayer
 * owner/admin, so it never mounts in single-player or for a plain member. All
 * mutations route through hooks whose `call()` wrapper toasts on failure, so
 * there are no silent failures here.
 *
 * In a PERSONAL space (C8 `spaceKind`) the whole membership surface is replaced
 * by the create-a-team CTA: personal spaces are non-invitable (every member-add
 * answers `403 personal_space`) and the roster is definitionally just the
 * caller, so the add form, pending invites, and roster would only offer a dead
 * end. A host that predates `spaceKind` omits it and keeps today's surface —
 * see `isPersonalSpace`.
 */
export default function MembersTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const { capabilities } = useCapabilities();
  const selfId = session?.uid ?? null;
  const canManage = ctx.isOwner;
  const members = ctx.org.members ?? [];
  const invites = ctx.org.invites ?? [];

  if (isPersonalSpace(capabilities)) {
    return (
      <div className="flex flex-col gap-8 py-6">
        <PeopleCreateTeamCta />
      </div>
    );
  }

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
      <PeopleRoster members={members} selfId={selfId} canManage={canManage} />
    </div>
  );
}
