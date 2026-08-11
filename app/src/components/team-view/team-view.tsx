import { useEffect } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useTeams } from "../../hooks/use-teams";
import { hasSpaces } from "../../lib/org-roles";
import {
  resolveTeamSection,
  teamById,
  teamPeopleFace,
  visibleAgentSections,
  visibleTeamSectionsForTeam,
} from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { AgentChrome } from "./agent-chrome";
import { AgentSettingsPane } from "./agent-settings-pane";
import { TeamChrome } from "./team-chrome";
import { TEAM_STRIP_THRESHOLDS } from "./team-chrome-layout";
import { TeamContextPane } from "./team-context-pane";
import { TeamFiles } from "./team-files";
import { TeamMissionControl } from "./team-mission-control";
import { TeamPeoplePane } from "./team-people-pane";
import { TeamRoutines } from "./team-routines";

export function TeamView() {
  const teams = useTeams();
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const requestedSection = useUIStore((s) => s.teamSection);
  const agentFilter = useUIStore((s) => s.teamAgentFilter);
  const requestedFocus = useUIStore((s) => s.teamAgentFocus);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const team = teamById(teams, activeTeamId);
  const agent =
    requestedFocus && team
      ? (team.agents.find((item) => item.id === agentFilter) ?? null)
      : null;
  const focused = agent !== null;
  useEffect(() => {
    if (requestedFocus && team && agent === null) {
      openTeamView(team.id, requestedSection ?? "mission-control");
    }
  }, [agent, openTeamView, requestedFocus, requestedSection, team]);
  if (team === null) return null;
  const peopleFace = teamPeopleFace(
    team,
    personalSpace,
    hasSpaces(capabilities),
  );
  const sections = focused
    ? visibleAgentSections(capabilities, agent)
    : visibleTeamSectionsForTeam(capabilities, team, peopleFace);
  const section = resolveTeamSection(sections, requestedSection);

  const body = focused ? (
    section === "settings" ? (
      <AgentSettingsPane team={team} agent={agent} />
    ) : section === "routines" ? (
      <TeamRoutines team={team} agentFocusId={agent.id} />
    ) : section === "files" ? (
      <TeamFiles team={team} agentFocusId={agent.id} />
    ) : (
      <TeamMissionControl team={team} agentFocusId={agent.id} />
    )
  ) : section === "context" ? (
    <TeamContextPane team={team} />
  ) : section === "people" && peopleFace !== "hidden" ? (
    <TeamPeoplePane team={team} face={peopleFace} />
  ) : section === "routines" ? (
    <TeamRoutines team={team} />
  ) : section === "files" ? (
    <TeamFiles team={team} />
  ) : (
    <TeamMissionControl team={team} />
  );

  return (
    <PageHeaderToolsProvider thresholds={TEAM_STRIP_THRESHOLDS}>
      <div className="flex h-full flex-col overflow-hidden">
        {focused ? (
          section !== "settings" && (
            <AgentChrome
              team={team}
              agent={agent}
              sections={sections}
              section={section}
            />
          )
        ) : (
          <TeamChrome team={team} sections={sections} section={section} />
        )}
        <div
          className="min-h-0 flex-1"
          key={`${team.id}:${agent?.id ?? "team"}`}
        >
          {body}
        </div>
      </div>
    </PageHeaderToolsProvider>
  );
}
