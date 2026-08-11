import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import { PageContainer } from "../shell/page-shell";
import { TeamAgentsList } from "./team-agents-list";
import { TeamContextPane } from "./team-context-pane";
import { TeamPeoplePane } from "./team-people-pane";
import { TeamSettingsActions } from "./team-settings-actions";

export function TeamSettingsPane(props: {
  team: TeamView;
  section: TeamSectionId;
  peopleFace: "roster" | "invite";
}) {
  if (props.section === "context") return <TeamContextPane team={props.team} />;
  if (props.section === "people")
    return <TeamPeoplePane team={props.team} face={props.peopleFace} />;
  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-8">
        {props.section === "agents" ? (
          <TeamAgentsList team={props.team} />
        ) : (
          <TeamSettingsActions team={props.team} />
        )}
      </PageContainer>
    </div>
  );
}
