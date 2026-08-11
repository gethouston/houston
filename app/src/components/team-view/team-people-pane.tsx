import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import type { TeamPeopleFace, TeamView } from "../../lib/teams-model";
import { CreateOrganizationInviteEmpty } from "../organization/create-organization-invite-empty";
import { PageContainer } from "../shell/page-shell";
import { TeamMembersCard } from "./team-members-card";

export function TeamPeoplePane({
  team,
  face,
}: {
  team: TeamView;
  face: Exclude<TeamPeopleFace, "hidden">;
}) {
  const { capabilities } = useCapabilities();
  const { data: org } = useOrg(
    face === "roster" && isMultiplayer(capabilities),
  );

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-8">
        {face === "roster" ? (
          <TeamMembersCard team={team} roster={org?.members ?? []} />
        ) : (
          <CreateOrganizationInviteEmpty />
        )}
      </PageContainer>
    </div>
  );
}
