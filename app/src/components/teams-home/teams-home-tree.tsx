import {
  BookOpenText,
  CalendarClock,
  Folder,
  type LucideIcon,
  Settings,
  SquareKanban,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { teamDisplayName } from "../../lib/team-display";
import { useUIStore } from "../../stores/ui";
import { TeamGlyph } from "../shell/team-glyph";
import type {
  TeamTreeRow,
  TeamTreeSection,
  TeamTreeSectionId,
} from "./teams-home-model";

/**
 * One team in the phone's Teams tree: a bold, NON-tappable identity row with
 * its section rows indented under a guide line.
 *
 * The team row is deliberately inert. A team has no screen of its own — Tasks
 * is what "the team" looks like — so a tappable team header would either
 * duplicate the first child row or open something the user did not name. The
 * guide line is what makes the sections read as its children instead.
 */

const SECTION_ICONS: Record<TeamTreeSectionId, LucideIcon> = {
  "mission-control": SquareKanban,
  routines: CalendarClock,
  context: BookOpenText,
  people: UsersRound,
  files: Folder,
  settings: Settings,
};

/**
 * Literal keys, not a template: `t()` is typed against the locale files, so a
 * section named without a word is a compile error rather than a row reading as
 * its own key. The settings-level rows take the SETTINGS tab words ("Settings",
 * not the desktop door's "Team Settings"), because inside a team's own tree the
 * team is already named one line above.
 */
const SECTION_LABEL_KEYS = {
  "mission-control": "teamView.tabs.missionControl",
  routines: "teamView.tabs.routines",
  context: "teamView.settingsTabs.context",
  people: "teamView.settingsTabs.people",
  files: "teamView.tabs.files",
  settings: "teamView.settingsTabs.settings",
} as const satisfies Record<TeamTreeSectionId, string>;

export function TeamTreeBlock({ row }: { row: TeamTreeRow }) {
  const { t } = useTranslation("teams");
  const openTeamView = useUIStore((s) => s.openTeamView);
  const name = teamDisplayName(row.team, t("teamView.defaultName"));
  const headingId = `teams-home-team-${row.team.id}`;
  const open = (section: TeamTreeSection) =>
    openTeamView(
      row.team.id,
      section.id,
      section.settingsLevel
        ? { teamSettingsFocus: true, nav: "push" }
        : { nav: "push" },
    );

  return (
    <li className="mb-2">
      <div
        data-testid="teams-home-team"
        data-team-id={row.team.id}
        className="flex min-h-10 items-center gap-2 px-3"
      >
        <TeamGlyph team={row.team} className="size-4 shrink-0" />
        <h2
          id={headingId}
          className="min-w-0 truncate text-base font-weight-510 text-ink"
        >
          {name}
        </h2>
      </div>
      <ul
        aria-labelledby={headingId}
        className="ml-3 border-l border-line pl-3"
      >
        {row.sections.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          return (
            <li key={section.id}>
              <button
                type="button"
                data-testid="teams-home-section"
                data-section={section.id}
                onClick={() => open(section)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <span className="min-w-0 truncate text-base text-ink">
                  {t(SECTION_LABEL_KEYS[section.id])}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
