import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import {
  resolveTeamSection,
  teamById,
  visibleTeamSections,
} from "../../lib/teams-model.ts";
import { useUIStore } from "../../stores/ui";
import { TeamMissionControl } from "./team-mission-control";
import { TeamSettings } from "./team-settings";

/**
 * The team screen: ONE kept-alive top-level view for every team, reading which
 * team and which section are open from the UI store (`openTeamView` sets both
 * together). Rendering one screen rather than one per team is what lets a team
 * be renamed, reordered or deleted without leaving a dead view behind.
 *
 * Sections that have no surface yet (Routines, Files) and Team Settings asked
 * for by someone who may not see it both resolve to Mission Control — one rule,
 * in `resolveTeamSection`, so a stale store can never land on a blank pane.
 *
 * A team id that no longer resolves renders nothing for the single frame it
 * takes the workspace shell's guard (`blockedTeamView`) to send the user back
 * to the dashboard.
 */
export function TeamView() {
  const teams = useTeams();
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teamSection = useUIStore((s) => s.teamSection);
  const { capabilities } = useCapabilities();

  const team = teamById(teams, activeTeamId);
  const section = resolveTeamSection(
    visibleTeamSections(capabilities),
    teamSection,
  );

  if (team === null) return null;
  return section === "settings" ? (
    <TeamSettings key={team.id} team={team} />
  ) : (
    <TeamMissionControl key={team.id} team={team} />
  );
}
