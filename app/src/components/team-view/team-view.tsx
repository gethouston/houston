import { useEffect } from "react";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
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
  visibleTeamSettingsSections,
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
import { TeamSettingsHeader } from "./team-settings-header";
import { TeamSettingsPane } from "./team-settings-pane";

export function TeamView() {
  const teams = useTeams();
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const requestedSection = useUIStore((s) => s.teamSection);
  const agentFilter = useUIStore((s) => s.teamAgentFilter);
  const requestedFocus = useUIStore((s) => s.teamAgentFocus);
  const requestedTeamSettingsFocus = useUIStore((s) => s.teamSettingsFocus);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const team = teamById(teams, activeTeamId);
  const agent =
    requestedFocus && team
      ? (team.agents.find((item) => item.id === agentFilter) ?? null)
      : null;
  const focused = agent !== null;
  const settingsFocused = requestedTeamSettingsFocus && !focused;
  const { canCreate } = useCanCreateAgents();
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
    : settingsFocused
      ? visibleTeamSettingsSections(team, peopleFace)
      : visibleTeamSectionsForTeam(capabilities, team, peopleFace);
  const section = resolveTeamSection(sections, requestedSection);

  const body = settingsFocused ? (
    <TeamSettingsPane
      team={team}
      section={section}
      peopleFace={peopleFace === "roster" ? "roster" : "invite"}
    />
  ) : focused ? (
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
        {settingsFocused ? (
          <TeamSettingsHeader
            team={team}
            sections={sections}
            active={section}
            canCreateAgent={canCreate}
          />
        ) : focused ? (
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
