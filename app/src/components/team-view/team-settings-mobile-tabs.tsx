import { useTranslation } from "react-i18next";
import type { TeamSectionId } from "../../lib/teams-model";
import {
  headerLozengeClasses,
  headerLozengeTrack,
} from "../shell/page-header/header-lozenge";

/** The drilled level's tabs, in the desktop's order. */
export const TEAM_SETTINGS_TAB_IDS = [
  "context",
  "agents",
  "people",
  "settings",
] as const satisfies readonly TeamSectionId[];

export type TeamSettingsTabId = (typeof TEAM_SETTINGS_TAB_IDS)[number];

/**
 * The phone's Team Settings tabs: Context, Agents, People, Settings — the
 * SAME tabs the desktop's drilled header carries, with the same words, under
 * the phone's drilled header instead of beside its back lozenge. On the
 * phone the level is entered as one tap from the Teams tree ("Team
 * Settings"), so this row is where its four panes are chosen, in the app's
 * own pill grammar (the header lozenge track the task list's segments use).
 *
 * Props only: the caller passes the tabs this caller may see and where a tap
 * lands, so a tab can never name a pane the view would refuse.
 */
export function TeamSettingsMobileTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly TeamSettingsTabId[];
  active: TeamSettingsTabId;
  onSelect: (tab: TeamSettingsTabId) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div
      role="tablist"
      aria-label={t("teamView.settingsTabs.label")}
      className={headerLozengeTrack("mx-4 mb-1 self-start overflow-x-auto")}
    >
      {tabs.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          data-testid="team-settings-mobile-tab"
          data-section={id}
          onClick={() => onSelect(id)}
          className={headerLozengeClasses(active === id)}
        >
          {t(`teamView.settingsTabs.${id}`)}
        </button>
      ))}
    </div>
  );
}
