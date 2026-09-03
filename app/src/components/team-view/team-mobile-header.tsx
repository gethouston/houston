import { useTranslation } from "react-i18next";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { TeamGlyph } from "../shell/team-glyph";
import { MobileDrilledHeader } from "./mobile-drilled-header";

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
  return (
    <MobileDrilledHeader
      backLabel={t("shell:teamsHome.title")}
      onBack={() => openTeamsHome({ nav: "retreat" })}
      glyph={<TeamGlyph team={team} className="size-5 shrink-0" />}
      title={teamDisplayName(team, t("teamView.defaultName"))}
      subtitle={t(TEAM_SECTION_TITLE_KEYS[section])}
      testId="team-mobile-back"
    />
  );
}
