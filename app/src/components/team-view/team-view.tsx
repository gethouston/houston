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
  const peopleFace = team
    ? teamPeopleFace(team, personalSpace, hasSpaces(capabilities))
    : "hidden";
  // The drilled level is re-gated on every render, never trusted from the store:
  // an empty list means this caller may not configure this team, so the view
  // owes them the team's base sections instead of an owner-only surface.
  const settingsSections = team
    ? visibleTeamSettingsSections(capabilities, team, peopleFace)
    : [];
  const settingsRequested = requestedTeamSettingsFocus && !focused;
  const settingsFocused = settingsRequested && settingsSections.length > 0;
  const settingsRefused = settingsRequested && settingsSections.length === 0;
  const { canCreate } = useCanCreateAgents();
  useEffect(() => {
    if (requestedFocus && team && agent === null) {
      openTeamView(team.id, requestedSection ?? "mission-control");
    }
  }, [agent, openTeamView, requestedFocus, requestedSection, team]);
  // Refused: land on the team's home section, not the one that was asked for.
  // Every section reachable from inside Team Settings lives only in there, so
  // carrying the request over would leave the store naming a section the base
  // level does not have.
  useEffect(() => {
    if (settingsRefused && team) openTeamView(team.id, "mission-control");
  }, [openTeamView, settingsRefused, team]);
  if (team === null) return null;
  const sections = focused
    ? visibleAgentSections(capabilities, agent)
    : settingsFocused
      ? settingsSections
      : visibleTeamSectionsForTeam(capabilities, team);
  const section = resolveTeamSection(sections, requestedSection);

  const body = settingsFocused ? (
    <TeamSettingsPane team={team} section={section} peopleFace={peopleFace} />
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
