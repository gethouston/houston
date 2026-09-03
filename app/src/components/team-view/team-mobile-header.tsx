import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { teamDisplayName } from "../../lib/team-display";
import { canConfigureTeam } from "../../lib/team-permissions";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { useTaskListChrome } from "../board/task-list-chrome";
import { MobileDrilledHeader } from "../shell/mobile-drilled-header";
import { TeamGlyph } from "../shell/team-glyph";
import { TeamTasksMenu } from "./team-tasks-menu";

/**
 * A team section's phone header. The team's own screen is DRILLED on the
 * phone — one push below the Teams tree that opened it — so it retreats there
 * rather than offering a section switcher: the tree already is the switcher,
 * and repeating it here would put the same six words on two consecutive
 * screens.
 */

/**
 * Exhaustive over `TeamSectionId`, as literals: `t()` is typed against the
 * locale files, so a new section without a word is a compile error instead of
 * a subtitle reading as its own key.
 */
export const TEAM_SECTION_TITLE_KEYS = {
  "mission-control": "teamView.tabs.missionControl",
  routines: "teamView.tabs.routines",
  files: "teamView.tabs.files",
  settings: "teamView.settingsTabs.settings",
  context: "teamView.settingsTabs.context",
  people: "teamView.settingsTabs.people",
  agents: "teamView.settingsTabs.agents",
} as const satisfies Record<TeamSectionId, string>;

export function TeamMobileHeader({
  team,
  section,
}: {
  team: TeamView;
  section: TeamSectionId;
}) {
  const { t } = useTranslation(["teams", "shell"]);
  const openTeamsHome = useUIStore((s) => s.openTeamsHome);
  const { capabilities } = useCapabilities();
  // Only the Tasks section has a list under this header, and only a mounted
  // list publishes its archive — so a section with nothing to overflow (or an
  // empty team, or the archive itself) draws no chip at all rather than a
  // menu whose items would do nothing.
  const hasTaskList = useTaskListChrome().showArchive !== null;
  return (
    <MobileDrilledHeader
      backLabel={t("shell:teamsHome.title")}
      onBack={() => openTeamsHome({ nav: "retreat" })}
      glyph={<TeamGlyph team={team} className="size-5 shrink-0" />}
      title={teamDisplayName(team, t("teamView.defaultName"))}
      subtitle={t(TEAM_SECTION_TITLE_KEYS[section])}
      trailing={
        section === "mission-control" && hasTaskList ? (
          <TeamTasksMenu
            team={team}
            canConfigure={canConfigureTeam(capabilities, team)}
          />
        ) : undefined
      }
      testId="team-mobile-back"
    />
  );
}
