import { Button, CatalogSectionHeader, Skeleton } from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentTeamMembers,
  useLeaveAgentTeam,
  useRemoveAgentTeamMember,
  useSetAgentTeamMemberOwner,
} from "../../hooks/queries/use-agent-teams";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useSession } from "../../hooks/use-session";
import type { TeamView } from "../../lib/teams-model";
import { TeamMemberRowView } from "./team-member-row.tsx";
import {
  buildTeamMemberRows,
  teamLeaveUserId,
  teamMembersView,
} from "./team-members-model.ts";

/** Three placeholder rows at the real row height, so the list arriving moves
 *  nothing that was already on screen. */
function MemberSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

/**
 * The people of a server-owned team (C13), under the team's agents: who joined
 * it, who runs it, and the caller's own way out of it.
 *
 * The list is the team's EXPLICIT membership rows and nothing else, which is
 * why it always ships with the admin note: the space's owners and managers run
 * every team without ever holding a row, so a roster read on its own would
 * claim a team nobody is in charge of. The default team goes further and has no
 * rows to read at all, so it says why instead of showing an empty list.
 *
 * Every write here is owner-only and every one of them can still be refused by
 * the gateway, which is the real enforcer; the mutation hooks already own that
 * surface (an expected refusal is an informational toast, anything else the red
 * report-bug one), so nothing in this file handles an error except the READ,
 * whose failure would otherwise read as "this team is empty".
 */
export function TeamMembersCard({
  team,
  roster,
}: {
  team: TeamView;
  /** The org read's people, used to name each row. Empty for a caller the
   *  gateway does not serve the roster to, who then reads raw ids. */
  roster: OrgMember[];
}) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const view = teamMembersView(team);

  const { data, isLoading, isError } = useAgentTeamMembers(
    team.id,
    view.showRoster,
  );
  const setOwner = useSetAgentTeamMemberOwner();
  const removeMember = useRemoveAgentTeamMember();
  const leave = useLeaveAgentTeam();

  const rows = useMemo(
    () =>
      buildTeamMemberRows({
        members: data ?? [],
        roster,
        selfId,
        readOnly: view.readOnly,
      }),
    [data, roster, selfId, view.readOnly],
  );
  const { profiles } = useUserProfiles(rows.map((row) => row.userId));

  if (!view.visible) return null;

  const leaveUserId = teamLeaveUserId(team, selfId);
  const pending = setOwner.isPending || removeMember.isPending;

  return (
    <section className="mt-10">
      <div className="mb-1 flex items-center justify-between gap-4">
        <CatalogSectionHeader
          title={t("agentTeams.settings.members.title")}
          count={team.server?.memberCount}
        />
        {leaveUserId !== null && (
          <Button
            variant="outline"
            size="sm"
            disabled={leave.isPending}
            onClick={() =>
              leave.mutate({ teamId: team.id, userId: leaveUserId })
            }
          >
            {t("agentTeams.leave")}
          </Button>
        )}
      </div>
      {/* The default team's note already explains itself, and "the people who
          joined this team" above it would contradict it. */}
      {view.showRoster && (
        <p className="mb-4 text-sm text-ink-muted">
          {t("agentTeams.settings.members.subtitle")}
        </p>
      )}

      {view.showDefaultNote && (
        <p className="mt-3 text-sm text-ink-muted">
          {t("agentTeams.settings.members.defaultNote")}
        </p>
      )}

      {view.showRoster &&
        (isLoading ? (
          <MemberSkeleton />
        ) : isError ? (
          // A failed read must not look like an empty team: say the LIST failed
          // and that trying again is the move, not "something went wrong".
          <p className="text-sm text-ink-muted">
            {t("agentTeams.settings.members.error")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t("agentTeams.settings.members.empty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1">
            {rows.map((row) => (
              <TeamMemberRowView
                key={row.userId}
                row={row}
                avatarUrl={avatarUrlFromProfiles(profiles, row.userId)}
                disabled={pending}
                onSetOwner={(owner) =>
                  setOwner.mutate({
                    teamId: team.id,
                    userId: row.userId,
                    owner,
                  })
                }
                onRemove={() =>
                  removeMember.mutate({ teamId: team.id, userId: row.userId })
                }
              />
            ))}
          </ul>
        ))}

      {view.showAdminNote && !isError && (
        <p className="mt-4 text-sm text-ink-muted">
          {t("agentTeams.settings.members.adminNote")}
        </p>
      )}
    </section>
  );
}
