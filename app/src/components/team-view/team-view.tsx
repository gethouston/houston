import type { ReactNode } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import {
  resolveTeamSection,
  type TeamView as Team,
  type TeamSectionId,
  teamById,
  visibleTeamSectionsForTeam,
} from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { TeamFiles } from "./team-files";
import { TeamMissionControl } from "./team-mission-control";
import { TeamRoutines } from "./team-routines";
import { TeamSettings } from "./team-settings";

/**
 * Section id → surface. An exhaustive `Record` rather than a chain of ternaries,
 * so adding a `TeamSectionId` without building its surface is a compile error
 * instead of a pane that silently falls through to Mission Control.
 */
const SECTIONS: Record<TeamSectionId, (props: { team: Team }) => ReactNode> = {
  "mission-control": TeamMissionControl,
  routines: TeamRoutines,
  files: TeamFiles,
  settings: TeamSettings,
};

/**
 * The team screen: ONE kept-alive top-level view for every team, reading which
 * team and which section are open from the UI store (`openTeamView` sets both
 * together). Rendering one screen rather than one per team is what lets a team
 * be renamed, reordered or deleted without leaving a dead view behind.
 *
 * The sections SWAP rather than hide, so only the surface on screen runs its
 * hooks, starts its reads and claims the shared shell detail panel. Team
 * Settings asked for by someone who may not see it ON THIS TEAM resolves back
 * to Mission Control — one rule, in `resolveTeamSection`, so a stale store can
 * never land on a blank pane. The section list is resolved from the team in
 * hand (`visibleTeamSectionsForTeam`), the SAME call the rail makes for the same
 * team, so the rail can never offer a row this screen refuses to render.
 *
 * A team id that no longer resolves renders nothing for the single frame it
 * takes the workspace shell's guard (`blockedTeamView`) to send the user back
 * to the dashboard — resolved FIRST, so the section is never asked of a team
 * that is not there and `resolveTeamSection` never sees an empty list.
 */
export function TeamView() {
  const teams = useTeams();
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teamSection = useUIStore((s) => s.teamSection);
  const { capabilities } = useCapabilities();

  const team = teamById(teams, activeTeamId);
  if (team === null) return null;

  const section = resolveTeamSection(
    visibleTeamSectionsForTeam(capabilities, team),
    teamSection,
  );
  // Keyed on the team, so switching teams starts every section clean instead of
  // carrying the previous team's selection, filter or open chat across.
  const Section = SECTIONS[section];
  return <Section key={team.id} team={team} />;
}
